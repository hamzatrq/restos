/**
 * `12-F10` — the nightly owner summary, as a fold over one business day's delivered events.
 *
 * ── WHERE THE DAY'S MONEY COMES FROM, AND WHY IT CANNOT BE RE-DERIVED HERE ────────────────
 *
 * **`sales.total_paisa` IS `Σ order.settlement_closed.billed_paisa` over the window.** Not a sum
 * that agrees with it — the same number, read off the ledger's own closing acts, so there is no
 * second derivation for the two to drift apart on. `01-F63` makes that field the ATTESTATION the
 * till appended when the bill was covered, and `01-F82` (R54) + `02-F63` (R70) fix what it means:
 * *what the customer owes, tax included*, rounded to the org's `charge_rounding_paisa`. `02-F63`
 * says so in terms — it is *"one number that `01-F30`'s equation, `01-F63`'s attested
 * `billed_paisa`, the `pay_total >= billed_total` cover test, the `shift_cash` fold and the printed
 * *Total* all mean"*. This report joins that list rather than starting a second one (`12-F21`).
 *
 * **The alternative — re-deriving a line sum here and adding tax — is not merely worse, it is
 * unbuildable on this plane, and the measurement is what settles it.** The tax cell and the charge
 * granularity are `00 §7` layer-2 settings whose carrier (`01-F87`) is decided and **not built**:
 * today they are three env vars seeded PER DEVICE (`RESTOS_TAX_POSTURE`, `RESTOS_TAX_RATE_BPS`,
 * `RESTOS_CHARGE_ROUNDING_PAISA` — `apps/pos-electron/src/main/tax-posture.ts`, and `00 §7` names
 * all three as stopgaps). `services/api` and `services/sync-gateway` hold **no tax configuration of
 * any kind**; a symbol-precise grep over both finds none. So a cloud-side `qty × unit_price × rate`
 * would have to INVENT the rate (Commandment 2), and under `12-F22`'s roll-up it would invent ONE
 * rate for branches that may sit on different postures. The till is the only process that knows
 * what it charged, and it wrote the number down.
 *
 * **What this fixes, stated as the defect it was.** This fold computed revenue as
 * `Σ qty × unit_price_paisa` over every delivered line — no tax term, and no arm for a voided line.
 * Measured end to end on 2026-08-23 it reported **Rs 2,679** against a ledger truth of
 * **Rs 2,968**: four raw pre-tax line sums with two voided Raitas still inside them, under a screen
 * that also read `raita · 2 sold · Rs 120` for two dishes nobody sold. Both halves are closed here,
 * and `__acceptance__/summary-corrections.test.ts` reproduces that exact day.
 *
 * **The three blocks tile, and that is a property to keep.** `Σ hourly.billed_paisa ==
 * sales.total_paisa` exactly, because the curve buckets the SAME attested figures. `Σ
 * by_channel.billed_paisa == sales.total_paisa` **minus** any order whose `order.created` did not
 * reach this window (`order_created_outside_window`), which is stated rather than hidden. The one
 * block that does NOT tile is `top_items`, and it cannot: an order-level attestation carries no
 * item breakdown, so splitting it per item would be an invented allocation. It is a pre-tax
 * menu-mix ranking and is labelled as one wherever it is rendered.
 *
 * ⚠ **THE DAY A SALE BANKS TO IS NOW THE DAY ITS BILL CLOSED, and that is a stated reading with a
 * losing alternative.** The window is `01-F46`'s Asia/Karachi 05:00 day applied to each event's own
 * branch stamp, so an order rung at 23:50 and closed at 00:10 banks to the night it was served
 * either way (`01-F46`'s whole case). What moves is the sharp edge: an order rung at 04:55 and
 * closed at 05:05 now banks to the FOLLOWING day. That is the same basis `shift.closed`'s
 * `expected_paisa_by_method` already uses — the drawer is counted against the payments taken in the
 * shift, not against the lines rung in it — so the owner's sales figure and the cashier's
 * reconciliation move onto ONE basis instead of two. It also makes the money count exactly once
 * across a boundary: the day the lines were rung reports the order as unsettled and takes no money
 * from it, and the day the bill closed takes all of it. The alternative — banking by the hour the
 * lines were rung — cannot be paid for, because the attested figure is per ORDER and has no
 * per-line share to distribute.
 *
 * **This file's hardest job is refusing to answer.** `restaurant-os.md` Appendix C and `12-F10`
 * name seven blocks; the product's ledger can answer four of them today. A summary is a report an
 * owner makes decisions on, so a block computed from events that do not exist is worse than an
 * absent block — Commandment 2, and `12-F11` already states the principle for the one number doc
 * 12 itself expects to be missing ("the margin line is omitted — never guessed, never shown as
 * zero"). `OMISSIONS` below is therefore part of the ANSWER, not a comment: it travels to the
 * screen and the screen renders it. See its own doc comment for the per-number reasoning.
 *
 * ── THE THREE LAWS, AS THEY BITE HERE ─────────────────────────────────────────────
 * 1. `01-F34` — no ordering metadata reaches a projected value. Seven envelope fields are read and
 *    no others: `id`, `type`, `payload`, `branch_id`, `branch_created_at`, `time_basis` and
 *    `actor_user_id` — the last four being delivered facts of the event, stamped once at the
 *    origin's append exactly as `payload` is. `id` is a SET KEY only, never a comparison, because
 *    `00 §6` pins ids to UUIDv7 whose leading 48 bits are the minting device's wall clock, so a
 *    `min(id)` tiebreak is min-wall-clock in a disguise (`26 §8`). `global_seq`, `lamport_seq`,
 *    `device_created_at` and `server_received_at` are not read by the fold at all;
 *    `server_received_at` is used only OUTSIDE it, for `12-F8`'s sync age, which is a statement
 *    about the cloud rather than about the business.
 * 2. `01-F43`/`01-F46` — a sale banks to the business day whose branch stamp contains it, at the
 *    Asia/Karachi 05:00 cutover. The WINDOW is applied upstream; what this fold does with time is
 *    bucket the hourly curve, and it buckets on the event's own delivered branch stamp. Events
 *    stamped `branch_provisional` are counted and REPORTED (`provisional_stamp_events`) rather
 *    than silently trusted — a provisional stamp is the raw device clock (`01-F44`), so its hour,
 *    and in the limit its day, may be wrong.
 * 3. Money accumulates in **BigInt**. Float `+` is not associative near 2^53, so a running double
 *    total lets DELIVERY ORDER decide a money outcome — a live law-1 break. A bucket that cannot
 *    be represented exactly contributes ZERO and raises `money_overflow`; it never truncates and
 *    never throws (`01-F17`, and this is a read path where a throw blanks an owner's screen).
 *
 * ── THE MERGE RULES, PER PROJECTED FIELD (`01-F34` requires them declared) ─────────
 *   order existence            monotone G-Set over delivered `order.created`, keyed by `order_id`.
 *   an order's channel         MVR over that id's `order.created` members. Agreed ⇒ carried.
 *                              DISAGREEING members contribute the order to NO channel, retain both
 *                              and raise `order_channel_divergence` — `01-F31`, "a fold never
 *                              picks a winner", the clause `shift-cash.ts` already applies.
 *   line existence + money     MVR keyed by `line_id`, member = canonical payload bytes. One line
 *                              redelivered under two envelope ids collapses to one member; two
 *                              members that differ dispute the line, contribute ZERO money and
 *                              raise `order_line_divergence`. Feeds `top_items` ONLY — the day's
 *                              money comes off the closing act, one row down.
 *   line exit (`02-F8` post-   monotone G-Set of `line_id` PER ORDER off `order.line_state_changed`,
 *   confirm, `02-F20`'s void)  split into EXIT edges (`voided`/`cancelled`) and other TERMINAL ones
 *                              (`served`/`delivered`). A line is out of `top_items` iff it has an
 *                              exit edge and no other terminal edge — which is exactly
 *                              `merge.ts`'s `billedCellPaisa` (`states.length === 1 &&
 *                              EXITED.has(states[0])`), including its contested case, where
 *                              `CONTESTED_LINE_BILLABLE = true` keeps a two-headed line billable.
 *                              Both halves monotone, so an exit is order-free and idempotent and
 *                              `01-F35`'s terminality is what makes that sound.
 *   an order's billed money    `agreed()` over an MVR of `order.settlement_closed` members (payload
 *                              bytes + the closing act's own branch stamp), then its attested
 *                              `billed_paisa`. Absent register ⇒ UNSETTLED: no money, counted in
 *                              `honesty.unsettled_orders`. Two differing members ⇒ ZERO and
 *                              `order_close_divergence` — `01-F31`, a fold never picks a winner.
 *                              ⚠ `merge.ts` reads the SAME field with a different rule (the LARGEST
 *                              valid snapshot) and both are right, because they answer different
 *                              questions: there it is `uncovered_addition`'s CEILING, where
 *                              understating is the unsafe direction, and a ceiling is a check.
 *                              Here it is the money on an owner's screen, and picking the larger of
 *                              two disputed attestations would print a number no act supports.
 *   corrections (`12-F10` 3)   `01-F83`'s `adjustment_attempt_id` is the `01-F31`-class key, so the
 *                              register is keyed by it and its member is the payload bytes plus the
 *                              ENVELOPE's `actor_user_id` (`02-F41`/`02-F45`: the cashier is on the
 *                              envelope and the approver is in the payload — two identities, two
 *                              homes). Diverging members dispute the key, contribute nothing and
 *                              raise `<kind>_divergence`.
 *   line removal (`02-F8`)     monotone G-Set of `line_id` PER ORDER, off `order.line_removed`. A
 *                              tombstone, never arithmetic: subtracting at fold time would subtract
 *                              twice on a redelivery (`01-F31`) and would subtract a line not yet
 *                              delivered, and a `delete` would be resurrected by an add arriving
 *                              after the removal (`01-F34` — the answer is a function of the SET,
 *                              never of delivery order). Per ORDER because `line_id` is
 *                              `z.string().min(1)` in `packages/domain` and nothing makes it
 *                              org-unique. This is the rule `packages/sync-client/src/folds/merge.ts`
 *                              already applies on the device, and `12-F21`'s "one number,
 *                              everywhere" is why it must be the same rule here.
 *   sales by channel           Σ (BigInt) of the attested `billed_paisa` of the orders on that
 *                              channel.
 *   top items                  Σ per `item_id` over lines that were neither removed nor exited,
 *                              ranked by (revenue desc, item_id asc). The tiebreak is a PAYLOAD
 *                              field, never an envelope id. PRE-TAX by construction — see the
 *                              header on why it cannot tile the day's total.
 *   hourly curve               Σ per hour offset from the day's cutover, on the CLOSING ACT's own
 *                              branch stamp. A bucket, not a selection — `01-F45`'s basis
 *                              precedence governs selection among competing members and there is
 *                              none here.
 *   shift cash                 CARRIED facts off `shift.closed` (`26 §7`, `02-F23`) — expected by
 *                              method, counted, and variance are READ, never re-derived. This is
 *                              the same rule `packages/sync-client/src/folds/shift-cash.ts`
 *                              applies on the device, and it is why the till's own reconciliation
 *                              and this summary cannot disagree: there is ONE interpretation of
 *                              over/short in this product and it is the number the cashier signed.
 *   cashier attribution        `02-F45` — the ENVELOPE's `actor_user_id` on `shift.opened`, never
 *                              a payload field. A shift whose open is outside the window has no
 *                              agreed actor and renders `null` with `shift_open_outside_window`.
 *   no-sale / paid-out         |G-Set| of `reason=no_sale` drawer opens and an envelope-id-keyed Σ
 *                              of paid-outs, bucketed by the shift the event CARRIES (`26 §7`).
 *   day open/close/deposit     MVR over `day.opened` / `day.closed` members per `day_id`; deposits
 *                              are an envelope-id-keyed G-Map, idempotent per envelope.
 *
 * ── WHERE THIS BELONGS EVENTUALLY ─────────────────────────────────────────────────
 * `13-F1`/`13-F2` put metrics in `services/intelligence/metrics` as a versioned registry with
 * golden fixtures and declared preconditions. That service is a two-line scaffold stub and its
 * registry is Wave-4 machinery (a metric version recorded on every answer, Zod parameter
 * whitelists, an LLM planning surface). Building it now to hold four numbers would be the
 * speculative generality `24 §3b` forbids. What IS preserved is the property `12-F12`/`12-F21`
 * actually turn on — ONE computation per number — by reading carried facts instead of re-deriving
 * them, so a later registry can adopt this fold rather than disagree with it.
 */

import {
  BUSINESS_DAY_CUTOVER_HOUR_DEFAULT,
  businessDate,
  businessDayBounds,
  canonicalJson,
  ORDER_CHANNELS,
  type OrderChannel,
  TERMINAL_LINE_STATES,
} from "@restos/domain";

/** One hour of the business day. Named because the number is used for both bucketing and length. */
const HOUR_MS = 3_600_000;

/** `12-F10` bullet 4 — the FR says five, and the number lives here rather than at a call site. */
const TOP_ITEM_COUNT = 5;

/**
 * `12-F10` bullet 3's three kinds, and the `01 §4` event type that carries each. Exhaustive and
 * ordered, so the block always renders all three rows: a missing row cannot tell *"no comps today"*
 * from *"the comp figure was never computed"* — the same rule `by_channel` follows for `02-F42`'s
 * closed channel set. `order.line_price_overridden` is `02-F20`'s fourth escalatable write and is
 * deliberately NOT here: `12-F10` bullet 3 names three, and adding a fourth would be inventing a
 * block the FR does not ask for.
 */
const CORRECTION_KINDS = ["void", "comp", "discount"] as const satisfies readonly CorrectionKind[];
const CORRECTION_TYPES: Readonly<Record<string, CorrectionKind>> = {
  "void.recorded": "void",
  "comp.recorded": "comp",
  "discount.recorded": "discount",
};

/**
 * Which of the three are already OUT of `sales.total_paisa`, as a declared table rather than an
 * inline `kind === "void"` — this is the one fact on the block that an owner would act on, and it
 * deserves a place a reader can argue with. See `CorrectionBlock` for the whole reasoning; in
 * short, only the void is a line EXIT (`DEC-MONEY-010` (2)), and only a line exit moves money out
 * of `01-F63`'s attestation.
 */
const REMOVED_FROM_SALES: Readonly<Record<CorrectionKind, boolean>> = {
  void: true,
  comp: false,
  discount: false,
};

/**
 * `01 §4`'s exit states, and the terminal states that are not exits.
 *
 * The two lists together ARE `merge.ts`'s `billedCellPaisa` rule expressed in the only shape a
 * report can see: a cell contributes zero *"when `states.length === 1 && EXITED.has(states[0])`"*,
 * and a contested terminal set stays billable because `CONTESTED_LINE_BILLABLE` is ratified `true`.
 * So a line is out of `top_items` iff an exit edge reached it and no other terminal edge did.
 *
 * The two are declared here rather than imported because `packages/sync-client` exports neither
 * (its `EXITED` is module-private) and `18 §6` keeps this plane off that package regardless. What
 * IS imported is `TERMINAL_LINE_STATES`, so the *partition* is checked against `domain`'s own
 * vocabulary rather than hand-copied twice — a typo in either list fails the assertion below at
 * module load, and `summary-corrections.test.ts` §A pins it as a fact rather than a hope.
 */
const EXIT_STATES: readonly string[] = ["voided", "cancelled"];
const FINISH_STATES: readonly string[] = TERMINAL_LINE_STATES.filter(
  (state) => !EXIT_STATES.includes(state),
);
const EXITED: ReadonlySet<string> = new Set(EXIT_STATES);
const FINISHED: ReadonlySet<string> = new Set(FINISH_STATES);

/**
 * Exactly the envelope fields this fold reads. `global_seq`, `lamport_seq`, `device_created_at`
 * and `server_received_at` are absent BY DESIGN (`01-F34`, `01-F45`) — a Proxy-poisoned envelope
 * throws the moment one of them is touched, which is how the invariance suite proves it.
 */
export type SummaryEvent = {
  readonly id: string;
  readonly type: string;
  readonly branch_id: string;
  readonly branch_created_at: number;
  readonly time_basis: string;
  /** `02-F45`'s single source of attribution — a delivered field, stamped once at the origin. */
  readonly actor_user_id: string | null;
  readonly payload: Record<string, unknown>;
};

/** `12-F10` bullet 1 — "sales total & order count by channel". */
export type ChannelSales = {
  readonly channel: OrderChannel;
  /**
   * Distinct SETTLED orders on this channel — orders this window holds a closing act for. Set
   * cardinality, so a redelivery counts once. It is deliberately the same population as
   * `billed_paisa` below: an order count that included the still-open table would divide a settled
   * total by an unsettled count, and an owner reads that ratio as her average check.
   */
  readonly orders: number;
  /** Σ of `01-F63`'s attested `billed_paisa` — tax-inclusive and rounded (`01-F82`, `02-F63`). */
  readonly billed_paisa: number;
};

/** `12-F10` bullet 2 — "cash expected vs counted per cashier, with over/short highlighted". */
export type ShiftCash = {
  readonly shift_id: string;
  /** `02-F45` — off the envelope of `shift.opened`. Null when that open is not in the window. */
  readonly cashier_user_id: string | null;
  readonly branch_id: string;
  readonly closed: boolean;
  /**
   * The `cash` bucket of `shift.closed`'s `expected_paisa_by_method`, CARRIED. Only the cash
   * bucket, because `02-F23`'s over/short is about the DRAWER: `card` and `raast` never enter it,
   * `khata_credit` is not money received, and `aggregator_receivable` is collected by the
   * aggregator. Null until the shift closes — there is no expected figure before the act.
   */
  readonly expected_cash_paisa: number | null;
  readonly counted_cash_paisa: number | null;
  /** `26 §7`'s CARRIED FACT. Signed: an over and a short are two directions. Never re-derived. */
  readonly variance_paisa: number | null;
  /** `02-F21` — the classic theft vector, "logged and counted". */
  readonly no_sale_count: number;
  /** `02-F26`. */
  readonly paid_out_paisa: number;
};

/**
 * `12-F10` bullet 4 — "top 5 items by revenue".
 *
 * **A PRE-TAX MENU-MIX RANKING, and the only block here that does not tile the day's total.** The
 * money above is `01-F63`'s per-ORDER attestation and carries no item breakdown, so splitting it
 * per item would be an allocation nothing in the corpus rules on. What these rows are is
 * `01-F53`'s captured line prices — `qty × unit_price_paisa` — over the lines that were neither
 * removed pre-confirm (`02-F8`) nor exited post-confirm (`02-F20`'s void). The RANKING is what the
 * FR asks for and a single org-wide rate cannot reorder it; the FIGURES are line prices and are
 * labelled as such on every surface that renders them.
 */
export type ItemRevenue = {
  readonly item_id: string;
  /** Units actually sold. A voided line contributes NEITHER a unit nor a rupee — see the block. */
  readonly qty: number;
  readonly revenue_paisa: number;
};

/** `12-F10` bullet 3 — the three correctives `01 §4` names, as this product can emit them. */
export type CorrectionKind = "void" | "comp" | "discount";

/**
 * `12-F10` bullet 3's *"and by whom"*, and it is TWO identities rather than one (`02-F20`).
 *
 * The cashier who performed the act is `actor_user_id` on the ENVELOPE, stamped at append from the
 * live PIN session (`02-F41`); the manager who approved it is `approver_user_id` in the PAYLOAD.
 * `02-F45` forbids duplicating the actor into the payload, so neither field can absorb the other,
 * and `registry.ts` makes the approver required-and-nullable on purpose: `null` is *"a manager did
 * this unsupervised"*, which `permissions.ts` allows outright, not *"nobody approved it"*.
 */
export type CorrectionActor = {
  readonly actor_user_id: string | null;
  readonly approver_user_id: string | null;
  readonly count: number;
  readonly value_paisa: number;
};

/**
 * One correction kind's count, value and attribution.
 *
 * ⚠ **`removed_from_sales` IS THE FIELD THAT STOPS THIS BLOCK MISLEADING AN OWNER, and the three
 * kinds do not agree on it.** A VOID is a line EXIT (`DEC-MONEY-010` (2): *"the LINE authoritative
 * wherever a line exists"*), so `merge.ts`'s `billedCellPaisa` already returns zero for that cell
 * and the attested `billed_paisa` never contained it. A COMP and a DISCOUNT are **recorded and not
 * subtracted** — neither is a line exit, `01 §4` has no `comped` state, and `01-F30`'s `comp_value`
 * and `discounts` terms are ABSENT until `DEC-MONEY-010`'s gate (iii) is met. The counter says the
 * same thing to the cashier in the same words (*"Recorded — the bill does NOT change yet"*), and a
 * screen that let an owner read "Discounts Rs 200" as money already off her takings would be wrong
 * in the opposite direction from the defect this file was fixing.
 *
 * ⚠ **`value_paisa` is the RECORDED MAGNITUDE, and for a void that is a PRE-TAX line value.**
 * `line-void.ts` derives it as `billedLinePaisa` of the exited cell — `01-F53`'s captured price —
 * so under an `exclusive` posture the drop in the tax-inclusive `billed_total` is LARGER than this
 * figure by that line's tax. No reader on this plane can compute the difference (see the file
 * header), so the recorded number is reported and named for what it is rather than adjusted.
 */
export type CorrectionBlock = {
  readonly kind: CorrectionKind;
  readonly count: number;
  readonly value_paisa: number;
  /** True only for `void`. See the type's own note — the three kinds genuinely differ here. */
  readonly removed_from_sales: boolean;
  /** Sorted by `actor_user_id` then `approver_user_id`, both PAYLOAD/ENVELOPE facts. */
  readonly by: readonly CorrectionActor[];
};

/**
 * `12-F10` bullet 5 — "hourly sales curve". One entry per hour of the business day.
 *
 * The hour a BILL CLOSED, on the closing act's own branch stamp — see the file header for why the
 * alternative (the hour each line was rung) cannot carry the tax-inclusive figure. These buckets
 * therefore sum to `sales.total_paisa` exactly, which is the property that stops a curve and a
 * headline disagreeing on one screen.
 */
export type HourBucket = {
  /** Hours since the day's cutover, 0-based. */
  readonly offset: number;
  /** The Asia/Karachi wall hour this bucket starts at, for the axis label. */
  readonly wall_hour: number;
  readonly billed_paisa: number;
};

/** `12-F9` / `02-F22` / `02-F24` — the day's own lifecycle, which decides "provisional". */
export type DayState = {
  readonly day_id: string;
  readonly branch_id: string;
  readonly closed: boolean;
  readonly opening_float_paisa: number;
  readonly counted_cash_paisa: number | null;
  readonly deposit_paisa: number;
};

/**
 * `00 §5.7` — a surface reports what is true, including about itself. Every field here exists
 * because an owner reading a smaller number confidently is the failure this file is shaped against.
 */
export type SummaryHonesty = {
  /** How many delivered events the window held. Zero is a real answer and reads as one. */
  readonly events: number;
  /**
   * `01-F44` — events stamped `branch_provisional` were stamped on a RAW DEVICE CLOCK (offset 0).
   * Their hour bucket, and in the limit their business day, may be wrong. Reported, never dropped:
   * dropping them would understate the day's takings, which is the worse of the two errors.
   */
  readonly provisional_stamp_events: number;
  /** True when EVERY branch that opened a day also closed it. `12-F9`'s provisional banner. */
  readonly every_day_closed: boolean;
  /** Shifts in the window with no delivered `shift.closed` — money still in an open drawer. */
  readonly open_shifts: number;
  /**
   * Orders this window saw that carry NO closing act — a bill nobody has settled yet. Their money
   * is not in any figure above, because `01-F63`'s attestation is the only tax-inclusive number
   * this plane can read and an unsettled order has not produced one. Reported rather than folded
   * in with a guessed line sum: that guess is precisely the defect this file was rebuilt to remove,
   * and `00 §5.7` prefers a stated absence to a confident smaller number.
   */
  readonly unsettled_orders: number;
  /**
   * The gateway's row cap was hit, so this is a PREFIX of the day and every total is a floor.
   * Reported rather than silently paged: a paged read of an append-only window is a second
   * mechanism, and this one is honest without it.
   */
  readonly truncated: boolean;
  /** Fold anomalies, sorted. `01-F31`/`02-F37`/`02-F43` names, never invented ones. */
  readonly anomalies: readonly string[];
};

/**
 * **THE PREMISE AN OMISSION RESTS ON, AS DATA A TEST CAN EVALUATE RATHER THAN PROSE A READER MUST
 * RE-CHECK.**
 *
 * Every `OMISSIONS` entry is a sentence about the state of this codebase, RENDERED TO AN OWNER. It
 * therefore goes stale silently, and when it does it tells her that a number she is reading cannot
 * be affected by something that is affecting it. That has now happened twice — the voids/comps/
 * discounts entry (all three of its clauses false in one day's commits, see the entry below) and
 * the prep-time entry, whose *"RestOS is T1-only today"* survived `apps/pass-kds` shipping a
 * production ready-mark. **Both were found by a human comparing a screen against the ledger; no
 * suite could see either**, because the claim was in a string.
 *
 * So each entry now declares the facts it depends on, in a shape
 * `__acceptance__/omission-premises.test.ts` evaluates against `@restos/domain` and
 * `@restos/sync-protocol` on every run. **A premise that stops holding is a RED test, not a wrong
 * sentence.** The four axes are not decoration — each is the way one of these entries can actually
 * become false — and the suite asserts that every axis is exercised by at least one entry, so a
 * check cannot go inert behind the others (`24-F14`).
 *
 * ⚠ **What it does NOT cover, stated so a green run is not read as total coverage.** It cannot see
 * a missing *estimation job*, a missing *threshold default*, or a spec act that opens
 * `DEC-MONEY-010`'s gate (iii). Those clauses are still prose and still rot; the premise narrows
 * the surface rather than closing it. Where a checkable proxy stands in for an uncheckable claim,
 * the entry says which.
 */
export type OmissionPremise = {
  /**
   * Event types that must have **no payload schema in `packages/domain`** for this entry to be
   * true. That is the executable form of *"nothing in this product can produce one"*: `parseEvent`
   * throws `UnknownEventTypeError` on a type with no schema and it gates BOTH ends of the ledger —
   * `packages/sync-client/src/device-store.ts`'s append and `services/sync-gateway/src/gateway.ts`'s
   * ingest — so a type absent from the registry cannot be written by any device or accepted by the
   * cloud. It is a stronger claim than "no emitter today", and it is checkable in one call.
   */
  readonly unemittable_types: readonly string[];
  /**
   * Event types that must **have** a payload schema. An entry can rot in this direction too, and
   * two do: entry 1's honesty depends on voids, comps and discounts being RECORDED (it points the
   * owner at a block that measures them), and entry 5's depends on ready-marks EXISTING. If either
   * set lost its schema the sentence would overstate what the product does.
   */
  readonly emittable_types: readonly string[];
  /**
   * `01 §4` line states that must NOT exist (`ORDER_LINE_STATES`). Entry 1 turns on the fact that a
   * comp is not a line exit; a `comped` state appearing is exactly the change that would make it
   * false, and it would be made in `packages/domain` by someone with no reason to read this file.
   */
  readonly absent_line_states: readonly string[];
  /**
   * The **complete** key set of the catalog entry this plane publishes (`CatalogEntryWire`), as it
   * stands. Any change — added key or removed — reddens.
   *
   * A list of FORBIDDEN names was the first draft and it is the weaker design: entry 3 rests on no
   * cost figure for a sold item reaching this plane, and nothing here can anticipate whether that
   * field arrives as `cost_paisa`, `unit_cost_paisa` or `recipe`. Pinning the whole set trades a
   * little noise on an unrelated field for a check that cannot be walked around by a name.
   */
  readonly catalog_entry_fields: readonly string[];
};

/** One thing this report does NOT contain, and the FR that decides it is absent. See `OMISSIONS`. */
export type Omission = {
  readonly block: string;
  readonly reason: string;
  readonly fr: string;
  /**
   * ⚠ **REQUIRED, and that is the point of the field.** A separate premise table keyed by `block`
   * was the alternative and it is weaker in exactly the way this table keeps failing: a parallel
   * list is enforced by a test someone must remember to extend, while a required member means a
   * new entry **cannot be written at all** without declaring what it depends on. It rides the wire
   * with the answer; the owner's screen renders `block`, `reason` and `fr` and ignores it.
   */
  readonly premise: OmissionPremise;
};

export type NightlySummary = {
  /** `YYYY-MM-DD` in Asia/Karachi — the date the business day STARTED (`01-F46`). */
  readonly business_date: string;
  /** The branches this answer covers, after `reportScope` narrowing. Sorted. */
  readonly branch_ids: readonly string[];
  readonly sales: {
    readonly total_paisa: number;
    readonly orders: number;
    readonly by_channel: readonly ChannelSales[];
  };
  readonly cash: readonly ShiftCash[];
  /** `12-F10` bullet 3 — one row per kind, always all three, so a zero is a MEASURED zero. */
  readonly corrections: readonly CorrectionBlock[];
  readonly top_items: readonly ItemRevenue[];
  readonly hourly: readonly HourBucket[];
  readonly days: readonly DayState[];
  readonly honesty: SummaryHonesty;
  readonly omissions: readonly Omission[];
};

/**
 * **THE LIST THAT IS AS VALUABLE AS THE SCREEN.** Every block `12-F10`/Appendix C names that this
 * product cannot answer today, with the reason and the FR that governs it. It is DATA, rendered by
 * the surface, so a block cannot quietly go missing and be mistaken for a zero.
 *
 * Each entry is checked against `packages/domain/src/registry.ts` — the emittable event set — and
 * **not** against the `01 §4` catalog. A type in the catalog with no payload schema is vocabulary,
 * not data, and that distinction is the whole list: **five of the seven entries below** rest on a
 * type the `01 §4` catalog names and `packages/domain` does not carry, so they would look
 * buildable to anyone who read the catalog and stopped there — purchases/wastage and margin on
 * `stock.*`, exception alerts on `alert.raised`, prep-time on `eta.estimates_published`, and open
 * tables on `table.state_changed`. Tips are the exception in the other direction: `tip.pooled` and
 * `tip.paid_out` are not even vocabulary yet.
 *
 * **Five of `12-F10`'s seven blocks are now ANSWERED** — sales by channel, cash per cashier,
 * `12-F10` bullet 3's voids/comps/discounts, top items, the hourly curve — and two are not:
 * purchases/wastage and `12-F11`'s margin. ⚠ *This paragraph said FOUR for as long as the
 * corrections block has existed, which is the same staleness the entries themselves keep
 * producing, one level up.*
 *
 * ── ⚠ WHY EVERY ENTRY CARRIES A `premise`, AND WHY IT IS A REQUIRED FIELD ─────────────────────
 *
 * See `OmissionPremise`. In short: this table has told an owner something false **twice**, both
 * times because a sentence about the codebase outlived the codebase, and both times it was caught
 * by a person rather than by a suite. The premise is the part a suite can hold —
 * `__acceptance__/omission-premises.test.ts` evaluates every entry's premise on every run, so an
 * omission that becomes MEASURABLE reddens a test instead of going on lying on a screen. That
 * suite runs in CI (`.github/workflows/ci.yml` runs `test`), which four of this repo's rails do
 * not.
 *
 * **The premise is not the whole reason and must not be read as one.** An entry's prose still
 * carries claims nothing can check — that no estimation job exists, that no threshold default is
 * stated anywhere in the corpus, that a gate in `26 §7` is unmet. Where a checkable fact stands in
 * for one of those, the entry names the substitution rather than hiding it.
 */
export const OMISSIONS: readonly Omission[] = [
  /**
   * ⚠ **THIS ENTRY REPLACES ONE THAT WENT ON ASSERTING, TO AN OWNER, ON THE SCREEN, THAT VOIDS
   * COULD NOT BE AFFECTING HER NUMBER WHILE THEY WERE.** It read: *"void.recorded, comp.recorded
   * and discount.recorded are 01 §4 catalog vocabulary with no payload schema in packages/domain
   * and no emitter anywhere in the product — the counter has no void, comp or discount surface at
   * all."* All three clauses were true when written and all three became false in one day's
   * commits: `registry.ts` carries the schemas, `apps/pos-electron/src/main/line-void.ts` is the
   * emitter, and `LineCorrection.tsx` is the surface. It is this repo's most-recorded defect shape
   * one turn worse than usual, because the stale claim was not a comment — it was RENDERED.
   *
   * What replaces it is the part that is genuinely still not measured, and it is a NETTING rather
   * than a measurement: the counts and the values are now reported (`corrections`), the void's
   * money is already out of the day's total through the line exit, and the comp's and the
   * discount's are not out of anything.
   *
   * **Its premise is the only one on this table that is mostly POSITIVE**, and deliberately: this
   * entry points an owner at a block that measures three things, so it rots if those three stop
   * being measurable just as surely as the others rot if theirs start.
   */
  {
    block: "Comps and discounts NETTED OUT of the day's takings",
    reason:
      "the count, value and attribution of every void, comp and discount ARE now reported (see " +
      "that block). What is still absent is the subtraction: a comp and a discount are recorded " +
      "and do not reduce the bill, because neither is a line exit, 01 §4 has no comped state, and " +
      "01-F30's comp_value and discounts terms stay ABSENT until DEC-MONEY-010's gate (iii) — an " +
      "oracle-pinned merge rule in 26 §7 — is met. So the sales figure above is what customers " +
      "were charged, and a comped dish is inside it. A void IS out of it: the line exits, and " +
      "01-F63's attested billed_paisa never contained it.",
    fr: "DEC-MONEY-010",
    premise: {
      // Gate (i) is CLOSED — all three ship a schema and an emitter, which is what makes the
      // "ARE now reported" clause true. Losing one would make this entry overstate the product.
      emittable_types: ["void.recorded", "comp.recorded", "discount.recorded"],
      // The clause "neither is a line exit". A `comped` state in `01 §4` is precisely the change
      // that would make a comp net out on its own, and it lands in `packages/domain`.
      absent_line_states: ["comped", "discounted"],
      unemittable_types: [],
      catalog_entry_fields: [],
    },
  },
  {
    block: "Purchases and wastage logged",
    reason:
      "no purchase, wastage, count or movement event can be emitted or ingested by anything " +
      "shipping today: the stock.* family is 01 §4 catalog vocabulary with no payload schema in " +
      "packages/domain, so parseEvent refuses one at both ends of the ledger. Module 10 is Wave 3 " +
      "(00 §1).",
    fr: "12-F10",
    premise: {
      unemittable_types: [
        "stock.purchase_recorded",
        "stock.wastage_recorded",
        "stock.count_recorded",
        "stock.movement_recorded",
      ],
      emittable_types: [],
      absent_line_states: [],
      catalog_entry_fields: [],
    },
  },
  /**
   * The one entry whose premise is a CATALOG SHAPE rather than an event type, because margin is a
   * cost question and a cost is not an act. `13-F5`'s precondition is recipe coverage on items
   * representing ≥ 60% of period revenue; today it is 0%, and the two ways a cost could reach this
   * plane at all are pinned below.
   */
  {
    block: "Estimated gross margin",
    reason:
      "12-F11 omits the margin line whenever recipe coverage is below 13-F5's precondition " +
      "(recipe coverage on items representing at least 60% of period revenue). No cost figure " +
      "for a sold item reaches this plane by any route: the catalog entry it publishes carries a " +
      "price and no cost, and stock.movement_recorded — the deduction chain that would value one " +
      "— has no payload schema. Coverage is 0%, so the FR's own rule applies verbatim: never " +
      "guessed, never shown as zero.",
    fr: "12-F11",
    premise: {
      unemittable_types: ["stock.movement_recorded"],
      emittable_types: [],
      absent_line_states: [],
      // `CatalogEntryWire`, exactly as it stands. A cost field is what would make this entry
      // false and no forbidden-name list can guess what it will be called, so the whole set is
      // pinned and any change reddens.
      catalog_entry_fields: [
        "kind",
        "id",
        "name",
        "kitchen_name",
        "parent_id",
        "sort",
        "deleted",
        "prices",
        "station",
      ],
    },
  },
  /**
   * ⚠ **THIS ENTRY WAS STALE IN ITS ARITHMETIC AND THE ARITHMETIC IS KEPT, WITH THE PREMISE THAT
   * MAKES IT CHECKABLE.** It said *"four of 13-F10's six detectors read events that do not
   * exist"* and named the surviving two as cash variance and no-sale opens. Measured 2026-08-24
   * against `registry.ts`: `void.recorded`, `comp.recorded` and `discount.recorded` all ship
   * schemas and an emitter, so detectors 1 and 2 moved — it is **two** of six that read absent
   * events (stock variance after a count, supplier price spikes) and **four** that do not.
   *
   * A bare count is exactly the clause that rots, which is why both halves are in the premise: if
   * `stock.count_recorded` gains a schema, or `void.recorded` loses one, the count is re-derived
   * by a failing test rather than by whoever next reads the screen.
   */
  {
    block: "What's odd (exception alerts)",
    reason:
      "13-F14a puts every alert class in this block from Wave 1, and no class can fire. " +
      "alert.raised has no payload schema in packages/domain — so nothing can emit or ingest one " +
      "— and services/intelligence is a scaffold stub. Two of 13-F10's six detectors also read " +
      "events that do not exist (stock variance after a count, supplier price spikes). The other " +
      "four now read events that DO — voids, comps and discounts, cash over/short at shift " +
      "close, no-sale drawer opens — and each still needs a threshold that 00 §7 places at layer " +
      "2, with no default stated anywhere in the corpus and no layer-2 config plane built (00 §7 " +
      "(f)). The anomalies reported above are the ledger's own 01-F31/02-F37/02-F43 facts. They " +
      "are not alerts and are not labelled as any.",
    fr: "13-F14a",
    premise: {
      unemittable_types: [
        "alert.raised",
        "alert.acknowledged",
        // 13-F10's two detectors that still read nothing.
        "stock.count_recorded",
        "stock.purchase_recorded",
      ],
      // 13-F10's other four, which is the half this entry got wrong.
      emittable_types: [
        "void.recorded",
        "comp.recorded",
        "discount.recorded",
        "shift.closed",
        "cash.drawer_opened",
      ],
      absent_line_states: [],
      catalog_entry_fields: [],
    },
  },
  /**
   * ⚠ **THIS ENTRY TOLD AN OWNER THAT HER KITCHEN PRODUCES NO TIMING SAMPLES, AFTER THE PRODUCT
   * HAD SHIPPED THE EMITTER THAT PRODUCES THEM.** It read: *"03-F26 gives a T1 branch no
   * ready-marks, so it honestly produces no samples, and 03-F28's confidence gate then yields NO
   * estimate rather than a guess. RestOS is T1-only today."* The last sentence is false:
   * `apps/pass-kds` ships `main/ready-mark.ts` and `main/serve-mark.ts` behind a declared `start`
   * script, and its own header calls it *"the second production emitter of
   * `order.line_state_changed`"* — on a branch that is T2 by `02-F31`'s own detection rule. The
   * first clause is a correct quotation of `03-F26` aimed at a tier this product is no longer
   * limited to.
   *
   * **Which half moved matters, so it is stated rather than smoothed over:** stage 2 is now
   * satisfiable and stages 3–5 are not. The entry survives, for a completely different reason
   * than the one it used to give.
   */
  {
    block: "Prep-time and ETA figures",
    reason:
      "03-F26's samples ARE produced now — apps/pass-kds ships a production ready-mark, so " +
      "confirm-to-ready durations reach the ledger on any branch running the pass screen. " +
      "Everything downstream is absent: 03-F27's estimation job (median and p80 over a rolling " +
      "60-day window) has no code, and 03-F29's eta.estimates_published has no payload schema, " +
      "so no gated estimate can be published or delivered. 03-F28's gate also needs at least 30 " +
      "samples in that window, which one business day is not.",
    fr: "03-F28",
    premise: {
      unemittable_types: ["eta.estimates_published"],
      // The sample source. If this lost its schema the first sentence above would be false.
      emittable_types: ["order.line_state_changed"],
      absent_line_states: [],
      catalog_entry_fields: [],
    },
  },
  {
    block: "Tips",
    reason:
      "DEC-MONEY-004 is ratified at FULL tips and forbids a tip field until tip.pooled and " +
      "tip.paid_out enter the 01 §4 catalog. They have not, so no tip figure may appear — " +
      "including inside the cash reconciliation, where a tip is drawer cash outside billed_total.",
    fr: "DEC-MONEY-004",
    premise: {
      // ⚠ A PROXY, and it fires LATE by design rather than by oversight. The FR's gate is entry
      // into the `01 §4` catalog, which no runtime value can see; the payload schema is the next
      // step and DEC-MONEY-004 puts the spec PR "before any code", so a schema appearing means
      // the catalog gate has already opened. Late is the safe direction here: the sentence is
      // about what the PRODUCT may show, and it cannot show a tip before a schema exists.
      unemittable_types: ["tip.pooled", "tip.paid_out"],
      emittable_types: [],
      absent_line_states: [],
      catalog_entry_fields: [],
    },
  },
  {
    block: "Open orders and open tables (the live view)",
    reason:
      "12-F5..F8's live ticker is a different surface from the nightly summary, and 12-F6 counts " +
      "tables only where the tier has a table map. table.state_changed — 05-F10's input, T3 only " +
      "— has no payload schema, so no table map can be folded at all. This report is the closed " +
      "day, never the running one.",
    fr: "12-F5",
    premise: {
      unemittable_types: ["table.state_changed"],
      emittable_types: [],
      absent_line_states: [],
      catalog_entry_fields: [],
    },
  },
];

// ── the accumulator ────────────────────────────────────────────────────────────────────────────

type Payload = Record<string, unknown>;
/** MVR register: canonical member bytes → member. An identical redelivery collapses to one. */
type Members = Map<string, Payload>;

type OrderAcc = {
  /** `order.created` members. Disagreement disputes the order's channel. */
  readonly created: Members;
  /** `line_id` → its own MVR register. */
  readonly lines: Map<string, Members>;
  /**
   * `02-F8` — `line_id`s this order's `order.line_removed` events tombstoned. Monotone, so a
   * redelivered removal is idempotent, and independent of whether the line itself has arrived.
   */
  readonly removed: Set<string>;
  /**
   * `01-F63`'s closing acts, as an MVR keyed by canonical payload bytes + the act's own branch
   * stamp. The stamp is folded INTO the member for the reason `agreedActor` folds the actor into a
   * shift open: the hour a bill closed is a projected value now (the hourly curve), so two members
   * disagreeing about it are two contested heads and a fold picks neither.
   */
  readonly closes: Members;
  /**
   * `01 §4`'s EXIT states delivered against a line of this order (`voided` / `cancelled`), and the
   * other TERMINAL ones (`served` / `delivered`) beside them. Two monotone G-Sets, because
   * `01-F35` makes every one of them terminal — an exit is permanent, so a set is the whole of
   * what a later reader needs and delivery order can never matter (`01-F34`).
   */
  readonly exited: Set<string>;
  readonly finished: Set<string>;
};

type ShiftAcc = {
  /** envelope id → who appended the open and where. Identity, never a comparison. */
  readonly opens: Map<string, { readonly actor: string | null }>;
  readonly closes: Members;
  /** envelope id → amount (`02-F26`), idempotent per envelope. */
  readonly paidOut: Map<string, number>;
  /** envelope ids of `reason=no_sale` drawer opens (`02-F21`). */
  readonly noSale: Set<string>;
  /** Branches stamped on events that named this shift — the row's `branch_id`. */
  readonly branches: Set<string>;
};

type DayAcc = {
  readonly opens: Members;
  readonly closes: Members;
  /** envelope id → amount (`02-F24`), idempotent per envelope. */
  readonly deposits: Map<string, number>;
  readonly branches: Set<string>;
};

export type SummaryState = {
  readonly orders: Map<string, OrderAcc>;
  readonly shifts: Map<string, ShiftAcc>;
  readonly days: Map<string, DayAcc>;
  /**
   * `12-F10` bullet 3, keyed the way `01-F83` says a corrective must be: kind → the act's
   * `adjustment_attempt_id` → that key's MVR register. Keyed by the ATTEMPT and not the envelope,
   * because `01-F8` already covers a transport duplicate and the case `01-F83` exists for is a
   * double-tapped approval — two genuine events, two envelope ids, one act.
   */
  readonly corrections: Map<CorrectionKind, Map<string, Members>>;
  readonly branches: Set<string>;
  /** Envelope ids seen, so a duplicated delivery cannot inflate the honesty count. */
  readonly seen: Set<string>;
  /** Envelope ids whose `time_basis` is not `branch` (`01-F44`). */
  readonly provisional: Set<string>;
};

export const emptySummary = (): SummaryState => ({
  orders: new Map(),
  shifts: new Map(),
  days: new Map(),
  corrections: new Map(CORRECTION_KINDS.map((kind) => [kind, new Map<string, Members>()])),
  branches: new Set(),
  seen: new Set(),
  provisional: new Set(),
});

const sub = <K, V>(m: Map<K, V>, k: K, mk: () => V): V => {
  const existing = m.get(k);
  if (existing !== undefined) return existing;
  const fresh = mk();
  m.set(k, fresh);
  return fresh;
};

const orderOf = (state: SummaryState, id: string): OrderAcc =>
  sub(state.orders, id, () => ({
    created: new Map(),
    lines: new Map(),
    removed: new Set(),
    closes: new Map(),
    exited: new Set(),
    finished: new Set(),
  }));

const shiftOf = (state: SummaryState, id: string): ShiftAcc =>
  sub(state.shifts, id, () => ({
    opens: new Map(),
    closes: new Map(),
    paidOut: new Map(),
    noSale: new Set(),
    branches: new Set(),
  }));

const dayOf = (state: SummaryState, id: string): DayAcc =>
  sub(state.days, id, () => ({
    opens: new Map(),
    closes: new Map(),
    deposits: new Map(),
    branches: new Set(),
  }));

/** `02-F21` names one reason and one only; the others exist and are not no-sales. */
const NO_SALE = "no_sale";

/**
 * The shift an event buckets to — `26 §7`: CARRIED on the event, never resolved at fold time by
 * asking "which shift is open?", which would read the reading process's own state and let two
 * readers project different money from one event set (`01-F34`).
 */
const carriedShift = (payload: Payload): string | null =>
  typeof payload.shift_id === "string" ? payload.shift_id : null;

/**
 * The branch stamp is folded INTO the CLOSING ACT's member rather than resolved beside it, for the
 * reason `02-F45` folds the actor into a shift open: the hour a bill closed is one of its carried
 * facts, so two members disagreeing about it are two contested heads and a fold picks neither.
 * The key is prefixed so it can never collide with a `01 §4` payload key.
 *
 * ⚠ **IT USED TO BE FOLDED INTO A LINE'S MEMBER INSTEAD, AND MOVING IT IS PART OF THIS CHANGE
 * RATHER THAN A TIDY-UP.** The rule the old comment gave was right — fold in what you project —
 * and its premise stopped holding the moment the hourly curve moved onto the closing act: a line's
 * stamp now reaches NO projected value, so keeping it in the member would DISPUTE a line
 * redelivered under two stamps and zero its item revenue for a disagreement about a fact nothing
 * reads. `merge.ts` does not fold stamps into line cells either.
 */
const STAMP_KEY = "__branch_stamp";

/**
 * The envelope's actor, folded into a corrective's member for the same reason. `12-F10` bullet 3
 * asks *"by whom"*, so the actor is a projected value here and two members naming two different
 * cashiers under one `adjustment_attempt_id` are two contested heads (`01-F31`).
 */
const ACTOR_KEY = "__envelope_actor";

/**
 * Fold one delivered envelope. A type outside this fold's vocabulary changes nothing — an
 * unrelated event is never silently bucketed, which is what lets the window's contents be a
 * superset of what the summary reads rather than a contract.
 */
export const foldSummary = (state: SummaryState, event: SummaryEvent): SummaryState => {
  state.seen.add(event.id);
  state.branches.add(event.branch_id);
  // `01-F44`'s envelope marker, read for REPORTING only. Nothing below branches on it — a fold
  // that dropped provisional money would understate the day, and one that promoted the marker
  // would rewrite an append-only fact.
  if (event.time_basis !== "branch") state.provisional.add(event.id);

  const payload = event.payload;
  switch (event.type) {
    case "order.created": {
      orderOf(state, payload.order_id as string).created.set(canonicalJson(payload), payload);
      return state;
    }
    case "order.line_added": {
      const acc = orderOf(state, payload.order_id as string);
      sub(acc.lines, payload.line_id as string, () => new Map<string, Payload>()).set(
        canonicalJson(payload),
        payload,
      );
      return state;
    }
    /**
     * `02-F8` — "line removal pre-confirm is `order.line_removed`". The payload is `{ order_id,
     * line_id }` and carries no quantity and no amount, so there is nothing partial it could
     * express and nothing to subtract: the tombstone is recorded here and the money is left out at
     * PROJECTION time. A removed line has no `void_value` term in `01-F30`, which is precisely
     * `02-F8`'s point — a line taken off before the kitchen heard of it was never a sale.
     */
    case "order.line_removed": {
      orderOf(state, payload.order_id as string).removed.add(payload.line_id as string);
      return state;
    }
    /**
     * `02-F20` / `02-F8`'s POST-confirm half, and the arm whose absence is what put two Raitas
     * nobody sold at the top of an owner's item table.
     *
     * `DEC-MONEY-010` (2) makes the LINE authoritative wherever a line exists — *"`void.recorded`
     * carries the approval facts and contributes value only for what no line exit removed"* — so
     * the money leaves through THIS event and `void.recorded` below is counted, never subtracted
     * twice. Both sets are monotone: `01-F35` makes every terminal state permanent, so a
     * redelivered edge is idempotent and a set is order-free by construction (`01-F34`).
     *
     * `state` and not `line_context[*].to`: `registry.ts` requires both, `line-void.ts` derives one
     * from the other object so they cannot disagree, and reading the top-level field is what
     * `merge.ts`'s own edge collection does. A state outside both lists (`in_prep`, `ready`) is a
     * workflow edge and belongs to `03-F47`'s screen, not to a money report.
     */
    case "order.line_state_changed": {
      const acc = orderOf(state, payload.order_id as string);
      const to = payload.state as string;
      const bucket = EXITED.has(to) ? acc.exited : FINISHED.has(to) ? acc.finished : null;
      if (bucket === null) return state;
      for (const line_id of (payload.line_ids as string[] | undefined) ?? []) bucket.add(line_id);
      return state;
    }
    /**
     * `01-F63`'s closing act — **the day's money**. The attested `billed_paisa` inside it is what
     * the customer owed, tax included and rounded (`01-F82`, `02-F63`); see the file header for why
     * this plane cannot compute that number and must read it.
     */
    case "order.settlement_closed": {
      const acc = orderOf(state, payload.order_id as string);
      const member: Payload = { ...payload, [STAMP_KEY]: event.branch_created_at };
      acc.closes.set(canonicalJson(member), member);
      return state;
    }
    /**
     * `12-F10` bullet 3 — the three correctives, counted and attributed, never netted.
     *
     * The key is `01-F83`'s `adjustment_attempt_id` and the member is the payload plus the
     * ENVELOPE's actor. A corrective with no key cannot be deduped at all — two deliveries of one
     * double-tapped approval would count twice and `01-F1` makes that permanent — so it is
     * REFUSED here rather than counted, and reported as `correction_key_absent`. `01-F4` already
     * makes such an event unemittable; this arm is what keeps that true of a report read from a
     * ledger written before the key existed.
     */
    case "void.recorded":
    case "comp.recorded":
    case "discount.recorded": {
      const kind = CORRECTION_TYPES[event.type] as CorrectionKind;
      const key = payload.adjustment_attempt_id;
      if (typeof key !== "string" || key.length === 0) {
        keylessOf(state).add(event.id);
        return state;
      }
      const register = state.corrections.get(kind) as Map<string, Members>;
      const member: Payload = { ...payload, [ACTOR_KEY]: event.actor_user_id };
      sub(register, key, () => new Map<string, Payload>()).set(canonicalJson(member), member);
      return state;
    }
    case "shift.opened": {
      const acc = shiftOf(state, payload.shift_id as string);
      acc.opens.set(event.id, { actor: event.actor_user_id });
      acc.branches.add(event.branch_id);
      return state;
    }
    case "shift.closed": {
      const acc = shiftOf(state, payload.shift_id as string);
      acc.closes.set(canonicalJson(payload), payload);
      acc.branches.add(event.branch_id);
      return state;
    }
    case "cash.drawer_opened": {
      // `02-F43`: an unbound open belongs to no shift row, and dropping it silently is the path
      // the FR names and forbids — it reaches the report through `unbound_drawer_open`.
      const shift = carriedShift(payload);
      if (shift === null) {
        state.seen.add(event.id);
        unboundOf(state).add(event.id);
        return state;
      }
      const acc = shiftOf(state, shift);
      acc.branches.add(event.branch_id);
      if (payload.reason === NO_SALE) acc.noSale.add(event.id);
      return state;
    }
    case "cash.paid_out": {
      const shift = carriedShift(payload);
      if (shift === null) {
        unboundPaidOutOf(state).add(event.id);
        return state;
      }
      const acc = shiftOf(state, shift);
      acc.branches.add(event.branch_id);
      acc.paidOut.set(event.id, payload.amount_paisa as number);
      return state;
    }
    case "day.opened": {
      const acc = dayOf(state, payload.day_id as string);
      acc.opens.set(canonicalJson(payload), payload);
      acc.branches.add(event.branch_id);
      return state;
    }
    case "day.closed": {
      const acc = dayOf(state, payload.day_id as string);
      acc.closes.set(canonicalJson(payload), payload);
      acc.branches.add(event.branch_id);
      return state;
    }
    case "cash.deposit_recorded": {
      const acc = dayOf(state, payload.day_id as string);
      acc.deposits.set(event.id, payload.amount_paisa as number);
      acc.branches.add(event.branch_id);
      return state;
    }
    default:
      return state;
  }
};

/**
 * `02-F43`'s unbound buckets. Held beside the state rather than on it so the state's shape stays
 * the four registers a reader has to reason about; they exist only to raise the two anomalies the
 * FR requires, and neither carries money into a total.
 */
const UNBOUND_DRAWER = new WeakMap<SummaryState, Set<string>>();
const UNBOUND_PAID_OUT = new WeakMap<SummaryState, Set<string>>();
/** Correctives delivered with no `01-F83` attempt key — counted nowhere, reported by name. */
const KEYLESS_CORRECTION = new WeakMap<SummaryState, Set<string>>();
const bucketOf = (map: WeakMap<SummaryState, Set<string>>, state: SummaryState): Set<string> => {
  const existing = map.get(state);
  if (existing !== undefined) return existing;
  const fresh = new Set<string>();
  map.set(state, fresh);
  return fresh;
};
const unboundOf = (state: SummaryState): Set<string> => bucketOf(UNBOUND_DRAWER, state);
const unboundPaidOutOf = (state: SummaryState): Set<string> => bucketOf(UNBOUND_PAID_OUT, state);
const keylessOf = (state: SummaryState): Set<string> => bucketOf(KEYLESS_CORRECTION, state);

// ── projection ─────────────────────────────────────────────────────────────────────────────────

/** Exact JS integer, or null when the bigint cannot be represented (standing law 3). */
const safeNumber = (value: bigint): number | null => {
  const exact = Number(value);
  return Number.isSafeInteger(exact) ? exact : null;
};

/**
 * A total the fold cannot represent EXACTLY contributes ZERO and raises `money_overflow` — the
 * `01-F31` disputed-key precedent, and the only order-free choice (a "sum of the representable
 * prefix" is a delivery-order artifact, and clamping is the silent truncation the ban prevents).
 */
const renderTotal = (value: bigint, anomalies: Set<string>): number => {
  const exact = safeNumber(value);
  if (exact === null) anomalies.add("money_overflow");
  return exact ?? 0;
};

/**
 * The AGREED member of a register, or `null` when the delivered members disagree (`01-F31`: a
 * disputed key contributes zero, all members are retained, an anomaly is raised, and a fold never
 * picks a winner). An empty register is `null` too; callers that must tell absence from dispute
 * read `members.size`.
 */
const agreed = (members: Members, code: string, anomalies: Set<string>): Payload | null => {
  if (members.size === 1) return [...members.values()][0] as Payload;
  if (members.size > 1) anomalies.add(code);
  return null;
};

/** A line's captured value, in BigInt (`01-F53`). `qty` is an integer count (`00 §6`). */
const lineValue = (member: Payload): bigint =>
  BigInt(member.qty as number) * BigInt(member.unit_price_paisa as number);

/**
 * `01-F63`'s attestation, read off ONE agreed closing act — **the day's money, and the only
 * tax-inclusive figure this plane can obtain** (`01-F82`, `02-F63`; see the file header).
 *
 * `null` is *"this act attests no readable amount"* and its two causes are kept apart on purpose,
 * because they mean different things to whoever reads the anomaly:
 *
 *  - **absent** — the act settled and carried no snapshot. `merge.ts` reads the same absence as
 *    *"no ceiling"* and `01-F63` is explicit that *"the act is the fact, the snapshot is evidence
 *    about it"*, so the order stays settled and stays counted; only its money is unknown.
 *  - **invalid** — a non-integer or negative snapshot. `merge.ts` raises `close_snapshot_invalid`
 *    for exactly this and the name is reused rather than reinvented (`12-F21`), so an owner and
 *    the device fold report one word for one fact.
 *
 * In both cases the contribution is ZERO and never a guess: substituting a line sum here would
 * reintroduce the tax-blind, void-blind number this file was rebuilt to remove, and it would do it
 * silently, on the one order where something already went wrong.
 */
const attestedBilled = (close: Payload, anomalies: Set<string>): bigint | null => {
  if (!("billed_paisa" in close)) {
    anomalies.add("close_snapshot_absent");
    return null;
  }
  const snapshot = close.billed_paisa;
  if (typeof snapshot !== "number" || !Number.isInteger(snapshot) || snapshot < 0) {
    anomalies.add("close_snapshot_invalid");
    return null;
  }
  return BigInt(snapshot);
};

/**
 * `02-F45` — the agreed cashier for a shift. Two opens naming two different actors are two
 * contested heads: neither is picked, `null` is projected, `shift_open_divergence` is raised. Two
 * opens naming the SAME actor are one agreed value (a redelivery, or a genuine duplicate open by
 * one person), so the register de-duplicates by the ACTOR rather than by the envelope id.
 */
const agreedActor = (acc: ShiftAcc, anomalies: Set<string>): string | null => {
  if (acc.opens.size === 0) {
    // A shift whose open fell outside the window — the commonest case is a shift that straddles
    // the 05:00 cutover. The money is still reported; only the name is missing, and saying so is
    // `00 §5.7` rather than printing an id nobody recognises.
    anomalies.add("shift_open_outside_window");
    return null;
  }
  const actors = new Set<string | null>();
  for (const open of acc.opens.values()) actors.add(open.actor);
  if (actors.size > 1) {
    anomalies.add("shift_open_divergence");
    return null;
  }
  return [...actors][0] ?? null;
};

/** Rows sorted by key (UTF-16 code unit) — row ORDER is part of the projection (`01-F34`). */
const sortedKeys = <V>(m: Map<string, V>): string[] => [...m.keys()].sort();

type ActorAcc = {
  readonly actor: string | null;
  readonly approver: string | null;
  count: number;
  total: bigint;
};

/** A delivered identity, or `null`. Both slots are nullable and neither may become the string. */
const stringOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);

/**
 * The `by` row's sort key: `(actor, approver)` as ONE string, so the rows are ordered by two
 * PAYLOAD/ENVELOPE facts and never by an envelope id (`26 §8`).
 *
 * `null` maps to the empty string and a present id is prefixed, so a null actor can never collide
 * with a cashier whose id is somehow empty — the two mean opposite things here (`null` on the
 * approver is "no approval was involved", which `permissions.ts` allows outright) and a report
 * that merged them would say a manager approved her own unsupervised void.
 */
const attributionKey = (actor: string | null, approver: string | null): string =>
  `${actor === null ? "" : `\u0001${actor}`}\u0002${approver === null ? "" : `\u0001${approver}`}`;

const soleBranch = (branches: Set<string>): string => [...branches].sort()[0] ?? "";

const sumOf = (amounts: Iterable<number>): bigint => {
  let total = 0n;
  for (const amount of amounts) total += BigInt(amount);
  return total;
};

export type ProjectOptions = {
  /** `01-F46`'s layer-2 org setting. Defaults to the platform default, never to midnight. */
  readonly cutover_hour?: number;
  /** The reader hit its row cap, so every total below is a floor. `00 §5.7`. */
  readonly truncated?: boolean;
};

/**
 * Project the whole summary — a pure, repeatable function of the delivered SET.
 *
 * `at_ms` is any instant inside the business day being reported; the boundary itself comes from
 * `01-F46`'s helper, so the arithmetic is declared once (`18 §2`) and the cloud cannot disagree
 * with the till about which day a sale banks to.
 */
export const projectSummary = (
  state: SummaryState,
  at_ms: number,
  options: ProjectOptions = {},
): NightlySummary => {
  const anomalies = new Set<string>();
  const cutover_hour = options.cutover_hour ?? BUSINESS_DAY_CUTOVER_HOUR_DEFAULT;
  const bounds = businessDayBounds(at_ms, cutover_hour);
  // A DST day (Pakistan 2008–2009) is 23 or 25 hours long. Deriving the count from the boundary
  // rather than assuming 24 is what keeps the last bucket from swallowing or losing an hour.
  const hours = Math.max(1, Math.round((bounds.end_ms - bounds.start_ms) / HOUR_MS));

  const perChannel = new Map<string, { orders: number; total: bigint }>();
  const perItem = new Map<string, { qty: number; total: bigint }>();
  const perHour = new Map<number, bigint>();
  let orders = 0;
  let unsettled_orders = 0;
  let salesTotal = 0n;

  for (const order_id of sortedKeys(state.orders)) {
    const acc = state.orders.get(order_id) as OrderAcc;
    const created = agreed(acc.created, "order_channel_divergence", anomalies);
    // An order whose `order.created` never arrived (its close did) is HELD, never parked into a
    // guessed channel: `01-F60` makes channel the PRICE KEY, so guessing one would attribute money
    // to a channel nobody sold on. Its money still reaches the day total and the hourly curve,
    // which is why `by_channel` can sum BELOW `total_paisa` — see the file header.
    if (acc.created.size === 0) anomalies.add("order_created_outside_window");
    const channel = created === null ? null : (created.channel as string);

    // ── `12-F10` bullet 4, the menu mix. Line-derived and PRE-TAX; see `ItemRevenue`. ──────────
    for (const line_id of sortedKeys(acc.lines)) {
      // `02-F8`'s two halves, read BEFORE the register so a line that is gone leaves the item
      // table and its unit count together. PRE-confirm the line was removed and was never a sale;
      // POST-confirm `02-F20`'s void exited it and `merge.ts` already returns zero for that cell.
      // A build that fixed only the money would leave `raita · 2 sold` standing beside a corrected
      // total — which is what the end-to-end run actually printed, and is worse than a missing row
      // because it names a dish and a quantity.
      if (acc.removed.has(line_id)) continue;
      // `billedCellPaisa`'s exact disposition: a DECIDED exit contributes nothing, and a line
      // holding an exit AND another terminal head is contested, which `CONTESTED_LINE_BILLABLE`
      // ratifies as billable. Neither branch reads delivery order (`01-F34`).
      if (acc.exited.has(line_id) && !acc.finished.has(line_id)) continue;
      const register = acc.lines.get(line_id) as Members;
      const member = agreed(register, "order_line_divergence", anomalies);
      if (member === null) continue;
      const item = sub(perItem, member.item_id as string, () => ({ qty: 0, total: 0n }));
      item.qty += member.qty as number;
      item.total += lineValue(member);
    }

    // ── the day's money: `01-F63`'s closing act and nothing else. ──────────────────────────────
    if (acc.closes.size === 0) {
      // A bill nobody has settled. `00 §5.7` — stated as a count, never folded in at a line sum.
      unsettled_orders += 1;
      continue;
    }
    // The ACT happened, so the order is counted even when its snapshot is unreadable: `01-F63`
    // separates the fact from the evidence about it, and dropping the order would understate the
    // count as well as the money.
    orders += 1;
    const close = agreed(acc.closes, "order_close_divergence", anomalies);
    const attested = close === null ? null : attestedBilled(close, anomalies);
    const value = attested ?? 0n;
    salesTotal += value;

    if (close !== null) {
      // The hourly bucket, on the CLOSING ACT's own delivered branch stamp (`01-F43`). An offset
      // outside the day is clamped into it and flagged: a `branch_provisional` stamp can land
      // anywhere, and dropping the money would understate the day, which is the worse of the two
      // errors. Clamping is also what keeps `Σ hourly === total_paisa` unconditionally true.
      const raw = Math.floor(((close[STAMP_KEY] as number) - bounds.start_ms) / HOUR_MS);
      if (raw < 0 || raw >= hours) anomalies.add("stamp_outside_business_day");
      const offset = Math.min(hours - 1, Math.max(0, raw));
      perHour.set(offset, (perHour.get(offset) ?? 0n) + value);
    }

    if (channel === null) continue;
    const bucket = sub(perChannel, channel, () => ({ orders: 0, total: 0n }));
    bucket.orders += 1;
    bucket.total += value;
  }

  // Exhaustive over `02-F42`'s CLOSED channel set, with explicit zeros — `01-F60`'s rule, and the
  // same reason `expectedPaisaByMethod` is exhaustive: a missing row cannot tell "no phone orders
  // today" from "the phone figure was never computed".
  const by_channel: ChannelSales[] = ORDER_CHANNELS.map((channel) => {
    const bucket = perChannel.get(channel);
    return {
      channel,
      orders: bucket?.orders ?? 0,
      billed_paisa: renderTotal(bucket?.total ?? 0n, anomalies),
    };
  });

  const top_items: ItemRevenue[] = [...perItem.entries()]
    .map(([item_id, bucket]) => ({
      item_id,
      qty: bucket.qty,
      revenue_paisa: renderTotal(bucket.total, anomalies),
    }))
    // Revenue descending, then `item_id` ascending. The tiebreak is a PAYLOAD field, never an
    // envelope id — `26 §8`: a `min(id)` tiebreak is min-wall-clock in a disguise, and here it
    // would let delivery order decide which of two equal-revenue items an owner is shown.
    //
    // COMPARISONS, not `b.revenue_paisa - a.revenue_paisa`. The `DEC-MONEY-005` GritQL rule flags
    // the subtraction and it is right to: a comparator is the one place a money difference looks
    // harmless, and the difference of two paisa values near 2^53 is exactly where a double stops
    // being exact — so the sort would disagree with itself on the numbers it is ordering. The rule
    // blesses comparisons on purpose; this is what it is blessing them for.
    .sort((a, b) => {
      if (a.revenue_paisa < b.revenue_paisa) return 1;
      if (b.revenue_paisa < a.revenue_paisa) return -1;
      return a.item_id < b.item_id ? -1 : 1;
    })
    .slice(0, TOP_ITEM_COUNT);

  const hourly: HourBucket[] = Array.from({ length: hours }, (_unused, offset) => ({
    offset,
    wall_hour: (cutover_hour + offset) % 24,
    billed_paisa: renderTotal(perHour.get(offset) ?? 0n, anomalies),
  }));

  /**
   * `12-F10` bullet 3 — count, value and by whom, for all three kinds always.
   *
   * Nothing here subtracts. `01-F30`'s `void_value`, `comp_value` and `discounts` terms are ABSENT
   * (`DEC-MONEY-010`, gate (iii) unmet: no oracle-pinned merge rule in `26 §7`), so this is a
   * REPORT and not a conservation equation — the day's money above is read off `01-F63`'s
   * attestation, which the void has already left through its line exit and the comp and the
   * discount never entered a subtraction at all.
   */
  const corrections: CorrectionBlock[] = CORRECTION_KINDS.map((kind) => {
    const register = state.corrections.get(kind) as Map<string, Members>;
    const by = new Map<string, ActorAcc>();
    let count = 0;
    let total = 0n;
    for (const attempt_id of sortedKeys(register)) {
      const members = register.get(attempt_id) as Members;
      // `01-F83` verbatim: "members diverging in any field mark the key disputed, contribute zero
      // … no fold picks a winner". A disputed corrective is not counted either — a count is a
      // claim about how many acts happened, and two irreconcilable members are not evidence of
      // one act or of two.
      const member = agreed(members, `${kind}_divergence`, anomalies);
      if (member === null) continue;
      count += 1;
      const amount = member.amount_paisa;
      // The MAGNITUDE, checked rather than trusted. `registry.ts` makes it a non-negative integer
      // and `01-F30` subtracts these terms, so a negative would ADD to a bill through a minus
      // sign; the act is still counted, because `01-F63`'s "the act is the fact, the snapshot is
      // evidence about it" is the same separation one event family over.
      const usable = typeof amount === "number" && Number.isInteger(amount) && amount >= 0;
      if (!usable) anomalies.add("correction_amount_invalid");
      const value = usable ? BigInt(amount as number) : 0n;
      total += value;

      const actor = stringOrNull(member[ACTOR_KEY]);
      const approver = stringOrNull(member.approver_user_id);
      const row = sub(by, attributionKey(actor, approver), () => ({
        actor,
        approver,
        count: 0,
        total: 0n,
      }));
      row.count += 1;
      row.total += value;
    }
    return {
      kind,
      count,
      value_paisa: renderTotal(total, anomalies),
      removed_from_sales: REMOVED_FROM_SALES[kind],
      by: sortedKeys(by).map((key) => {
        const row = by.get(key) as ActorAcc;
        return {
          actor_user_id: row.actor,
          approver_user_id: row.approver,
          count: row.count,
          value_paisa: renderTotal(row.total, anomalies),
        };
      }),
    };
  });

  const cash: ShiftCash[] = sortedKeys(state.shifts).map((shift_id) => {
    const acc = state.shifts.get(shift_id) as ShiftAcc;
    const close = agreed(acc.closes, "shift_close_divergence", anomalies);
    const expected = close?.expected_paisa_by_method as Record<string, number> | undefined;
    return {
      shift_id,
      cashier_user_id: agreedActor(acc, anomalies),
      branch_id: soleBranch(acc.branches),
      closed: acc.closes.size > 0,
      expected_cash_paisa: expected === undefined ? null : (expected.cash ?? 0),
      counted_cash_paisa: (close?.counted_cash_paisa as number | undefined) ?? null,
      // `26 §7`'s CARRIED FACT: READ, never re-derived. A read-time recompute would silently move
      // a number the cashier already signed, the moment a late payment arrived (`01-F1`).
      variance_paisa: (close?.variance_paisa as number | undefined) ?? null,
      no_sale_count: acc.noSale.size,
      paid_out_paisa: renderTotal(sumOf(acc.paidOut.values()), anomalies),
    };
  });

  const days: DayState[] = sortedKeys(state.days).map((day_id) => {
    const acc = state.days.get(day_id) as DayAcc;
    const open = agreed(acc.opens, "day_open_divergence", anomalies);
    const close = agreed(acc.closes, "day_close_divergence", anomalies);
    return {
      day_id,
      branch_id: soleBranch(acc.branches),
      closed: acc.closes.size > 0,
      opening_float_paisa: (open?.opening_float_paisa as number | undefined) ?? 0,
      counted_cash_paisa: (close?.counted_cash_paisa as number | undefined) ?? null,
      deposit_paisa: renderTotal(sumOf(acc.deposits.values()), anomalies),
    };
  });

  if (unboundOf(state).size > 0) anomalies.add("unbound_drawer_open");
  if (unboundPaidOutOf(state).size > 0) anomalies.add("unbound_paid_out");
  // `01-F83` — a corrective with no attempt key cannot be deduped, so it is counted nowhere and
  // named here. Unemittable through `01-F4` today; the ledger is append-only and older.
  if (keylessOf(state).size > 0) anomalies.add("correction_key_absent");

  // `12-F9` — "day not closed yet, figures provisional". The claim is about branches that STARTED
  // a day and did not finish it; a branch with no `day.opened` has no day to close.
  const opened = new Set(days.map((d) => d.branch_id));
  const closed = new Set(days.filter((d) => d.closed).map((d) => d.branch_id));
  const every_day_closed = opened.size > 0 && [...opened].every((b) => closed.has(b));

  return {
    // One millisecond into the day, so a boundary instant can never round to the previous date.
    business_date: businessDate(bounds.start_ms + 1, cutover_hour),
    branch_ids: [...state.branches].sort(),
    sales: { total_paisa: renderTotal(salesTotal, anomalies), orders, by_channel },
    cash,
    corrections,
    top_items,
    hourly,
    days,
    honesty: {
      events: state.seen.size,
      provisional_stamp_events: state.provisional.size,
      every_day_closed,
      open_shifts: cash.filter((shift) => !shift.closed).length,
      unsettled_orders,
      truncated: options.truncated === true,
      anomalies: [...anomalies].sort(),
    },
    omissions: OMISSIONS,
  };
};

/** Fold a whole delivered set and project it. The one entry point a caller needs. */
export const summarise = (
  events: Iterable<SummaryEvent>,
  at_ms: number,
  options: ProjectOptions = {},
): NightlySummary => {
  const state = emptySummary();
  for (const event of events) foldSummary(state, event);
  return projectSummary(state, at_ms, options);
};
