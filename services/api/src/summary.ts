/**
 * `12-F10` — the nightly owner summary, as a fold over one business day's delivered events.
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
 *                              raise `order_line_divergence`.
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
 *   sales by channel           Σ (BigInt) of the agreed lines of the orders on that channel.
 *   top items                  Σ per `item_id`, ranked by (revenue desc, item_id asc). The
 *                              tiebreak is a PAYLOAD field, never an envelope id.
 *   hourly curve               Σ per hour offset from the day's cutover, on each line's own branch
 *                              stamp. A bucket, not a selection — `01-F45`'s basis precedence
 *                              governs selection among competing members and there is none here.
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
} from "@restos/domain";

/** One hour of the business day. Named because the number is used for both bucketing and length. */
const HOUR_MS = 3_600_000;

/** `12-F10` bullet 4 — the FR says five, and the number lives here rather than at a call site. */
const TOP_ITEM_COUNT = 5;

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
  /** Distinct `order.created` ids on this channel. Set cardinality, so a redelivery counts once. */
  readonly orders: number;
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

/** `12-F10` bullet 4 — "top 5 items by revenue". */
export type ItemRevenue = {
  readonly item_id: string;
  readonly qty: number;
  readonly revenue_paisa: number;
};

/** `12-F10` bullet 5 — "hourly sales curve". One entry per hour of the business day. */
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
   * The gateway's row cap was hit, so this is a PREFIX of the day and every total is a floor.
   * Reported rather than silently paged: a paged read of an append-only window is a second
   * mechanism, and this one is honest without it.
   */
  readonly truncated: boolean;
  /** Fold anomalies, sorted. `01-F31`/`02-F37`/`02-F43` names, never invented ones. */
  readonly anomalies: readonly string[];
};

/** One thing this report does NOT contain, and the FR that decides it is absent. See `OMISSIONS`. */
export type Omission = {
  readonly block: string;
  readonly reason: string;
  readonly fr: string;
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
 * Each entry was checked against `packages/domain/src/registry.ts` — the emittable event set — and
 * against the emitters, **not** against the `01 §4` catalog. A type in the catalog with no payload
 * schema and no producer is vocabulary, not data, and that distinction is the whole list: four of
 * these blocks would look buildable to anyone who read `01 §4` and stopped there.
 */
export const OMISSIONS: readonly Omission[] = [
  {
    block: "Voids, comps and discounts",
    reason:
      "void.recorded, comp.recorded and discount.recorded are 01 §4 catalog vocabulary with no " +
      "payload schema in packages/domain and no emitter anywhere in the product — the counter has " +
      "no void, comp or discount surface at all. There is nothing to count, and a zero would read " +
      "as 'a clean day' rather than 'not measured'.",
    fr: "12-F10",
  },
  {
    block: "Purchases and wastage logged",
    reason:
      "the stock.* family is Wave 3 (00 §1 rates module 10 at wave 3). No purchase, wastage or " +
      "count event can be emitted by anything shipping today.",
    fr: "12-F10",
  },
  {
    block: "Estimated gross margin",
    reason:
      "12-F11 omits the margin line whenever recipe coverage is below 13-F5's precondition. " +
      "Recipe data does not exist at all, so coverage is 0% and the FR's own rule applies " +
      "verbatim — never guessed, never shown as zero.",
    fr: "12-F11",
  },
  {
    block: "What's odd (exception alerts)",
    reason:
      "13-F14a puts every alert class in this block from Wave 1, and no class can fire. " +
      "alert.raised has no payload schema and no producer (services/intelligence is a scaffold " +
      "stub); four of 13-F10's six detectors read events that do not exist; and the two that do — " +
      "cash variance at shift close, no-sale opens — each need a threshold that 00 §7 places at " +
      "layer 2, with no default stated anywhere in the corpus and no layer-2 config plane built. " +
      "The anomalies reported above are the ledger's own 01-F31/02-F37/02-F43 facts. They are not " +
      "alerts and are not labelled as any.",
    fr: "13-F14a",
  },
  {
    block: "Prep-time and ETA figures",
    reason:
      "03-F26 gives a T1 branch no ready-marks, so it honestly produces no samples, and 03-F28's " +
      "confidence gate then yields NO estimate rather than a guess. RestOS is T1-only today.",
    fr: "03-F28",
  },
  {
    block: "Tips",
    reason:
      "DEC-MONEY-004 is ratified at FULL tips and forbids a tip field until tip.pooled and " +
      "tip.paid_out enter the 01 §4 catalog. They have not, so no tip figure may appear — " +
      "including inside the cash reconciliation, where a tip is drawer cash outside billed_total.",
    fr: "DEC-MONEY-004",
  },
  {
    block: "Open orders and open tables (the live view)",
    reason:
      "12-F5..F8's live ticker is a different surface from the nightly summary and needs a table " +
      "map this tier does not have. This report is the closed day, never the running one.",
    fr: "12-F5",
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
  sub(state.orders, id, () => ({ created: new Map(), lines: new Map(), removed: new Set() }));

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
 * The branch stamp is folded INTO a line's member rather than resolved beside it, for the reason
 * `02-F45` folds the actor into a shift open: the hour a line was rung is one of its carried
 * facts, so two members disagreeing about it are two contested heads and a fold picks neither.
 * The key is prefixed so it can never collide with a `01 §4` payload key.
 */
const STAMP_KEY = "__branch_stamp";

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
      const member: Payload = { ...payload, [STAMP_KEY]: event.branch_created_at };
      sub(acc.lines, payload.line_id as string, () => new Map<string, Payload>()).set(
        canonicalJson(member),
        member,
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
const bucketOf = (map: WeakMap<SummaryState, Set<string>>, state: SummaryState): Set<string> => {
  const existing = map.get(state);
  if (existing !== undefined) return existing;
  const fresh = new Set<string>();
  map.set(state, fresh);
  return fresh;
};
const unboundOf = (state: SummaryState): Set<string> => bucketOf(UNBOUND_DRAWER, state);
const unboundPaidOutOf = (state: SummaryState): Set<string> => bucketOf(UNBOUND_PAID_OUT, state);

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

/** A line's billed value, in BigInt. `qty` is an integer count (`00 §6`). */
const lineValue = (member: Payload): bigint =>
  BigInt(member.qty as number) * BigInt(member.unit_price_paisa as number);

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
  let salesTotal = 0n;

  for (const order_id of sortedKeys(state.orders)) {
    const acc = state.orders.get(order_id) as OrderAcc;
    const created = agreed(acc.created, "order_channel_divergence", anomalies);
    if (acc.created.size > 0) orders += 1;
    // An order whose `order.created` never arrived (its lines did) is HELD, never parked into a
    // guessed channel: `01-F60` makes channel the PRICE KEY, so guessing one would attribute money
    // to a channel nobody sold on. Its money still reaches the day total and the hourly curve.
    else anomalies.add("order_created_outside_window");
    const channel = created === null ? null : (created.channel as string);

    let orderTotal = 0n;
    for (const line_id of sortedKeys(acc.lines)) {
      // `02-F8` — the tombstone is read BEFORE the register, so the line leaves every block at
      // once: the total, its channel row, the top-items table and the hourly bucket. A build that
      // subtracted only from the total leaves the Coke standing in three of the six blocks
      // `12-F10` names, and an owner reads two different days off one screen. Nothing is disputed
      // about a line that is gone, so no `order_line_divergence` is raised for one.
      if (acc.removed.has(line_id)) continue;
      const register = acc.lines.get(line_id) as Members;
      const member = agreed(register, "order_line_divergence", anomalies);
      if (member === null) continue;
      const value = lineValue(member);
      orderTotal += value;

      const item = sub(perItem, member.item_id as string, () => ({ qty: 0, total: 0n }));
      item.qty += member.qty as number;
      item.total += value;

      // The hourly bucket, on the line's OWN delivered branch stamp (`01-F43`). An offset outside
      // the day is clamped into it and flagged: a `branch_provisional` stamp can land anywhere,
      // and dropping the money would understate the day, which is the worse of the two errors.
      const raw = Math.floor(((member[STAMP_KEY] as number) - bounds.start_ms) / HOUR_MS);
      if (raw < 0 || raw >= hours) anomalies.add("stamp_outside_business_day");
      const offset = Math.min(hours - 1, Math.max(0, raw));
      perHour.set(offset, (perHour.get(offset) ?? 0n) + value);
    }

    salesTotal += orderTotal;
    if (channel === null) continue;
    const bucket = sub(perChannel, channel, () => ({ orders: 0, total: 0n }));
    bucket.orders += 1;
    bucket.total += orderTotal;
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
    top_items,
    hourly,
    days,
    honesty: {
      events: state.seen.size,
      provisional_stamp_events: state.provisional.size,
      every_day_closed,
      open_shifts: cash.filter((shift) => !shift.closed).length,
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
