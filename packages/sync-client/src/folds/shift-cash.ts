// The `shift_cash` fold (S-2; `FOLDS.md` line 15) — the shift/day lifecycle and the cash
// reconciliation behind `02-F23`'s "I'm clean" screen: expected cash BY METHOD (`02-F23`,
// `01-F32`), over/short as a CARRIED FACT (`26 §7`), no-sale drawer opens (`02-F21`),
// paid-outs (`02-F26`), the `01-F46` business day (`02-F22`/`02-F24`), and `02-F37`'s
// settlements taken with no shift open.
//
// A pure function of the delivered event SET, exactly as `folds/merge.ts` is, and it lives
// beside it under the `@restos/sync-client/fold-engine` subpath for the same reason: the
// cloud Auditor refolds without loading the better-sqlite3 addon, and a MONEY fold the
// Auditor cannot refold is unauditable.
//
// ── THE THREE LAWS, AS THEY BITE HERE ───────────────────────────────────────
// 1. `01-F34` — the fold reads NO ordering metadata. Five envelope fields are read and no
//    others: `type`, `payload`, `id`, `branch_created_at` and `time_basis`. `id` is used
//    only as a SET KEY (which drawer opens are distinct events), never in a comparison that
//    reaches a projected value — `26 §8`: `00 §6` pins ids to UUIDv7 whose leading 48 bits
//    are the minting device's wall clock, so a `min(envelope.id)` tiebreak is min-wall-clock
//    in a disguise. There is no clock-free "canonical winner" anywhere in this fold either:
//    `01-F31`'s rule is that a fold NEVER picks a winner, so disagreeing members render as a
//    contested value rather than being resolved by `payloadHash`.
// 2. `01-F43`/`01-F45` — `shifts.open_at` and `days.business_date` take the event's
//    BRANCH stamp, never `device_created_at`, and selection among competing stamps applies
//    `01-F45`'s BASIS PRECEDENCE first (see `earliest`).
// 3. Money accumulates in **BigInt**. Float `+` is not associative near 2^53, so a running
//    double total lets DELIVERY ORDER decide a money outcome — a live `01-F34` break. A
//    bucket that cannot be represented exactly contributes ZERO and raises `money_overflow`;
//    it never truncates and never throws, because this fold runs inside the ingest path
//    where a throw would wedge a real, rung-up sale (`01-F17`).
//
// ── THE MERGE RULES, PER PROJECTED FIELD (`01-F34` requires them declared) ───
//   shifts/days row existence   monotone G-Set over the delivered `*.opened` events.
//   open_at, business_date      earliest delivered BRANCH stamp WITHIN THE STRONGEST DELIVERED
//                               BASIS TIER (`01-F45`) — a min over a partition of the set, so
//                               it is order-free.
//   cashier, prev_*_id, float   MVR over the open payloads. Agreed ⇒ carried; DISAGREEING
//                               members mark the key disputed, contribute zero (money → 0,
//                               a nullable link → null), are all retained and raise a
//                               `*_divergence` anomaly — `01-F31`, "a fold never picks a
//                               winner", the clause `01-F58` already applies outside the
//                               payment domain.
//   expected_json               grow-only map union over METHODS; each method's value is the
//                               `01-F31` unique-keyed sum over settlement attempt keys. The
//                               attempt-key map is ORG-GLOBAL (`01-F31`'s ratified uniqueness
//                               scope, `26 §7`'s first unstated law), NOT per shift: nested
//                               inside a shift bucket, two members disagreeing about the
//                               carried `shift_id` land in two different maps, so the one
//                               divergence that matters most is the one that cannot be seen —
//                               and the money is counted TWICE instead of zero.
//   paid_out_paisa, deposits    Σ over an event-id-keyed G-Map (idempotent per envelope).
//   no_sale_count               |G-Set| of `reason=no_sale` drawer opens (`02-F21`).
//   closed                      monotone OR over the close G-Set — nothing un-closes.
//   counted/expected_at_close    CARRIED facts snapshotted onto `shift.closed`, and `variance`
//                               is a THIRD carried fact (`26 §7` "over/short → a carried fact";
//                               `registry.ts` makes `variance_paisa` required on the close).
//                               A read-time recompute is the defect `26 §7` names: it would
//                               silently move a number the cashier already signed the moment
//                               a late payment arrived, which `01-F1` forbids.
//   unbound                     `02-F37`: a settlement carrying a null shift reference is
//                               RECORDED with the `unbound_settlement` anomaly, never
//                               refused, and opening a shift later never retro-binds it.
//   unbound_drawer              `02-F43`: a drawer open / paid-out carrying a null shift is
//                               accepted, COUNTED into this bucket, and raises
//                               `unbound_drawer_open` / `unbound_paid_out` on exactly
//                               `02-F37`'s terms. Storing such an event and dropping it from
//                               every total satisfies `02-F21`'s word "logged" while defeating
//                               the theft detection the FR exists for — the silent path
//                               `02-F43` names and forbids.
//
// Accumulation is in place on the passed state (the `merge.ts` lattice does the same); the
// fold's purity is the property `01-F34` states — the state is a function of the delivered
// SET, with nothing read from the reading device.
import { businessDate, canonicalJson } from "@restos/domain";

/** `shifts` row — `FOLDS.md` line 15's five columns plus the named `02-F21`/`02-F23`/
 * `02-F26` additions the FRs require. */
export type ShiftRow = {
  shift_id: string;
  cashier: string | null;
  prev_shift_id: string | null;
  open_at: number;
  expected_json: string;
  paid_out_paisa: number;
  no_sale_count: number;
  /** 0/1 — SQLite STRICT has no boolean type, and the projection matches the table. */
  closed: number;
  counted_cash_paisa: number | null;
  expected_at_close_json: string | null;
  variance_paisa: number | null;
  exceptions_json: string;
};

/** `days` row (`02-F22` float, `02-F24` count + deposit, `01-F46` boundary). */
export type DayRow = {
  day_id: string;
  business_date: string;
  prev_day_id: string | null;
  opening_float_paisa: number;
  deposit_paisa: number;
  closed: number;
  counted_cash_paisa: number | null;
  exceptions_json: string;
};

/**
 * `02-F37` — the settlement that succeeded with no shift open, under the name the FR gives.
 *
 * `order_id`/`method` are NULLABLE for one reason only: when the attempt key is DISPUTED
 * (`01-F31`) there is no agreed value to carry and a fold never picks a winner, so the row
 * renders the same way every other contested register in this fold does — money to zero, a
 * carried scalar to null, the anomaly raised, the members retained in the lattice.
 */
export type UnboundRow = {
  settlement_attempt_id: string;
  order_id: string | null;
  method: string | null;
  amount_paisa: number;
  anomaly: string;
};

/**
 * `02-F43` — the drawer events that carry no shift reference, COUNTED rather than dropped.
 * One bucket, not one row per event: an unbound drawer open has no key of its own (a shift id
 * is exactly what it lacks), and the FR asks for a count and a total, not an inventory.
 */
export type UnboundDrawerRow = {
  no_sale_count: number;
  paid_out_paisa: number;
  exceptions_json: string;
};

export type ShiftCashProjection = {
  shifts: ShiftRow[];
  days: DayRow[];
  unbound: UnboundRow[];
  unbound_drawer: UnboundDrawerRow;
};

type Payload = Record<string, unknown>;

/**
 * Exactly the envelope fields this fold reads. `lamport_seq`, `global_seq`,
 * `device_created_at` and `server_received_at` are absent BY DESIGN — `01-F34`/`01-F45`, and
 * `26 §8`'s Proxy-poisoned envelopes throw the moment one of them is touched.
 */
type ShiftEvent = {
  id: string;
  type: string;
  payload: Payload;
  branch_created_at: number;
  time_basis: string;
};

/**
 * Delivered `*.opened` events, keyed by envelope id: identity, never a comparison.
 * `verified` is `01-F44`'s envelope marker reduced to the one bit `01-F45` selects on.
 */
type Opens = Map<string, { stamp: number; verified: boolean; payload: Payload }>;

type ShiftAcc = {
  opens: Opens;
  /** MVR keyed by canonical payload bytes — an identical redelivery collapses. */
  closes: Map<string, Payload>;
  /** envelope id → amount (`02-F26`). */
  paidOut: Map<string, number>;
  /** envelope ids of `reason=no_sale` drawer opens (`02-F21`). */
  noSale: Set<string>;
};

type DayAcc = {
  opens: Opens;
  closes: Map<string, Payload>;
  deposits: Map<string, number>;
};

export type ShiftCashState = {
  shifts: Map<string, ShiftAcc>;
  days: Map<string, DayAcc>;
  /**
   * `01-F31` UKS at its RATIFIED scope — ORG-GLOBAL, not per shift: attempt key →
   * (canonical member bytes → member, where the member is the payload MINUS its key). One
   * attempt key resolves ONCE, wherever it claims to sit, so two members disagreeing about
   * the carried `shift_id` dispute the key instead of quietly banking the money twice.
   */
  pay: Map<string, Map<string, Payload>>;
  /** `02-F43`: envelope id → `reason`, for drawer opens carrying a null shift reference. */
  unboundDrawer: Map<string, string>;
  /** `02-F43`: envelope id → amount, for paid-outs carrying a null shift reference. */
  unboundPaidOut: Map<string, number>;
};

export const emptyShiftCash = (): ShiftCashState => ({
  shifts: new Map(),
  days: new Map(),
  pay: new Map(),
  unboundDrawer: new Map(),
  unboundPaidOut: new Map(),
});

/** `02-F21` names one reason and one only; the others exist and are not no-sales. */
const NO_SALE = "no_sale";

const sub = <K, V>(m: Map<K, V>, k: K, mk: () => V): V => {
  const existing = m.get(k);
  if (existing !== undefined) return existing;
  const fresh = mk();
  m.set(k, fresh);
  return fresh;
};

const shiftOf = (state: ShiftCashState, id: string): ShiftAcc =>
  sub(state.shifts, id, () => ({
    opens: new Map(),
    closes: new Map(),
    paidOut: new Map(),
    noSale: new Set(),
  }));

const dayOf = (state: ShiftCashState, id: string): DayAcc =>
  sub(state.days, id, () => ({ opens: new Map(), closes: new Map(), deposits: new Map() }));

/**
 * The shift an event buckets to — `26 §7`: the shift key is CARRIED on the event, never
 * resolved at fold time by asking "which shift is open?", which would read the READING
 * device's state and let two devices project different money from one event set (`01-F34`).
 *
 * `null` is a first-class value, not an error: `02-F37` for settlements, and `02-F21`/`02-F26`
 * for an unbound drawer open or paid-out — a schema that refused those would leave the theft
 * vector UNLOGGED.
 */
const carriedShift = (payload: Payload): string | null =>
  typeof payload.shift_id === "string" ? payload.shift_id : null;

/** `01-F44`'s envelope marker, reduced to the bit `01-F45`'s precedence selects on. */
const isVerified = (event: ShiftEvent): boolean => event.time_basis === "branch";

/**
 * Fold one envelope. Types outside this fold's vocabulary (`FOLDS.md` line 15) change
 * nothing — an unrelated event is never silently bucketed.
 */
export const foldShiftCash = (state: ShiftCashState, envelope: unknown): ShiftCashState => {
  const event = envelope as ShiftEvent;
  const payload = event.payload;
  switch (event.type) {
    case "shift.opened": {
      shiftOf(state, payload.shift_id as string).opens.set(event.id, {
        stamp: event.branch_created_at,
        verified: isVerified(event),
        payload,
      });
      return state;
    }
    case "shift.closed": {
      shiftOf(state, payload.shift_id as string).closes.set(canonicalJson(payload), payload);
      return state;
    }
    case "cash.drawer_opened": {
      const shift = carriedShift(payload);
      // 02-F21 counts `reason=no_sale` and nothing else. 02-F43: a drawer open carrying NO
      // shift is not a malformed event — it is a drawer opened before the day's first shift
      // (making change, a supplier at the door) — so it goes to the unbound bucket rather
      // than the floor. Every unbound open is FLAGGED; only the `no_sale` ones are counted,
      // exactly as on a shift row, because 02-F21 owns the discriminator on both paths.
      if (shift === null) {
        state.unboundDrawer.set(event.id, payload.reason as string);
      } else if (payload.reason === NO_SALE) {
        shiftOf(state, shift).noSale.add(event.id);
      }
      return state;
    }
    case "cash.paid_out": {
      const shift = carriedShift(payload);
      // 02-F43: unbound petty cash still LEFT the drawer. Dropping it here is the silent
      // path the FR names — money accounted for in no shift, no day and no anomaly.
      if (shift === null) {
        state.unboundPaidOut.set(event.id, payload.amount_paisa as number);
      } else {
        shiftOf(state, shift).paidOut.set(event.id, payload.amount_paisa as number);
      }
      return state;
    }
    case "day.opened": {
      dayOf(state, payload.day_id as string).opens.set(event.id, {
        stamp: event.branch_created_at,
        verified: isVerified(event),
        payload,
      });
      return state;
    }
    case "day.closed": {
      dayOf(state, payload.day_id as string).closes.set(canonicalJson(payload), payload);
      return state;
    }
    case "cash.deposit_recorded": {
      dayOf(state, payload.day_id as string).deposits.set(event.id, payload.amount_paisa as number);
      return state;
    }
    case "payment.recorded": {
      // 01-F31: the payload MINUS its attempt key is the immutable intent — members
      // diverging in ANY field dispute the key. Keying the member map by canonical bytes is
      // what makes a double-tap (one intent, two envelope ids) count once.
      //
      // The `shift_id` stays INSIDE the member and the map is keyed at the STATE ROOT
      // (01-F31's org-global scope): where the settlement buckets is one of the fields that
      // can diverge, so a per-shift map would resolve the key twice — once per claimed
      // bucket — and bank the money in both. 02-F37's unbound path is the same map with a
      // null carried key, so it is one resolution, never a second code path.
      const { settlement_attempt_id: attempt, ...member } = payload as Payload & {
        settlement_attempt_id: string;
      };
      sub(state.pay, attempt, () => new Map<string, Payload>()).set(canonicalJson(member), member);
      return state;
    }
    default:
      return state;
  }
};

/** Exact JS integer, or null when the bigint cannot be represented (standing law 3). */
const safeNumber = (value: bigint): number | null => {
  const exact = Number(value);
  return Number.isSafeInteger(exact) ? exact : null;
};

/**
 * A total the fold cannot represent EXACTLY contributes ZERO and raises `money_overflow` —
 * the `01-F31` disputed-key precedent and the only order-free choice (a "sum of the
 * representable prefix" is a delivery-order artifact, and clamping is the silent truncation
 * the ban exists to prevent). Never throws: `01-F17`.
 */
const renderTotal = (value: bigint, exceptions: Set<string>): number => {
  const exact = safeNumber(value);
  if (exact === null) exceptions.add("money_overflow");
  return exact ?? 0;
};

/**
 * The AGREED carried facts of a value register, or an EMPTY payload when the delivered
 * members disagree (`01-F31`: a disputed key contributes zero, all members are retained, an
 * anomaly is raised, and a fold never picks a winner). An absent register is empty too — the
 * caller distinguishes the two by the register's own size where it matters (`closed`).
 */
const agreed = (members: Map<string, Payload>, code: string, exceptions: Set<string>): Payload => {
  if (members.size === 1) return [...members.values()][0] as Payload;
  if (members.size > 1) exceptions.add(code);
  return {};
};

/** The open payloads, value-deduped — an identical redelivery is one member, not two. */
const openMembers = (opens: Opens): Map<string, Payload> => {
  const members = new Map<string, Payload>();
  for (const o of opens.values()) members.set(canonicalJson(o.payload), o.payload);
  return members;
};

/**
 * Earliest delivered BRANCH stamp (`01-F43`), with `01-F45`'s BASIS PRECEDENCE applied
 * FIRST: members stamped `branch` are selected among before any `branch_provisional` one,
 * and a provisional stamp is used only when no `branch` member exists. Callers guard
 * `opens.size > 0`.
 *
 * Precedence is not decoration on a min. A `branch_provisional` stamp IS the raw device
 * clock (offset 0, `01-F44`), so a plain min over every delivered open hands the projected
 * value to whichever device's clock is furthest BEHIND — the tablet powered on before the
 * counter dates the shift years in the past, and `days.business_date` (`01-F46`) inherits it
 * and banks a whole evening to the wrong day. That is the same class of break as reading
 * `device_created_at` outright, which is exactly why `01-F45` carries the rule.
 *
 * It stays `01-F34`-safe because precedence is a PARTITION of the delivered set: the tier is
 * chosen by the set's own contents, the min inside it is order-free, and nothing here reads
 * an id, a sequence or this device's clock. Same shape as the confirm anchor in `merge.ts`.
 */
const earliest = (opens: Opens): number => {
  let min: number | null = null;
  let minVerified: number | null = null;
  for (const o of opens.values()) {
    if (min === null || o.stamp < min) min = o.stamp;
    if (o.verified && (minVerified === null || o.stamp < minVerified)) minVerified = o.stamp;
  }
  return (minVerified ?? min) as number;
};

const sumOf = (amounts: Iterable<number>): bigint => {
  let total = 0n;
  for (const amount of amounts) total += BigInt(amount);
  return total;
};

/**
 * `26 §7`'s carried causal link, read: two DISTINCT entities naming ONE predecessor is a fork —
 * two devices healing after a partition, ordinary offline behaviour. Both rows stand with
 * their links and the fork is flagged; a fold never picks a winner (`01-F31`). A null
 * predecessor links nothing, so the branch's first shift (or day) is not a fork.
 *
 * `26 §7` lists "duplicate shift/day open" as ONE row of the matrix and `registry.ts` carries
 * `prev_day_id` for exactly that reason, so the day gets the same detector rather than a
 * second, subtly different one — a fork detector that covered only shifts left a duplicate
 * DAY open (which is the whole branch's opening cash and its `01-F46` boundary) unflagged.
 */
const forkedBy = <A extends { opens: Opens }>(accs: Map<string, A>, link: string): Set<string> => {
  const successors = new Map<string, Set<string>>();
  for (const [id, acc] of accs) {
    for (const o of acc.opens.values()) {
      const prev = o.payload[link];
      if (typeof prev === "string") sub(successors, prev, () => new Set<string>()).add(id);
    }
  }
  const forked = new Set<string>();
  for (const ids of successors.values()) {
    if (ids.size > 1) for (const id of ids) forked.add(id);
  }
  return forked;
};

/**
 * Rows for one accumulator table, sorted by key (UTF-16 code unit). Row ORDER is part of the
 * projection — returning insertion order would make delivery order observable (`01-F34`).
 *
 * A row exists only once the entity's `*.opened` has been delivered. Everything keyed to a
 * shift or day whose open has not arrived — or never will, `00 §6` soft refs — is HELD in the
 * lattice, never dropped and never parked into a projection hole, and surfaces with its money
 * the moment the open lands.
 */
const rowsOf = <A extends { opens: Opens }, R>(
  accs: Map<string, A>,
  build: (id: string, acc: A) => R,
): R[] => {
  const rows: R[] = [];
  for (const id of [...accs.keys()].sort()) {
    const acc = accs.get(id) as A;
    if (acc.opens.size > 0) rows.push(build(id, acc));
  }
  return rows;
};

/** One shift's share of the org-global attempt-key resolution. */
type Tendered = { expected: Map<string, bigint>; disputed: boolean };

const tenderedOf = (buckets: Map<string, Tendered>, shift: string): Tendered =>
  sub(buckets, shift, () => ({ expected: new Map<string, bigint>(), disputed: false }));

/**
 * Resolve every settlement attempt key ONCE, org-globally (`01-F31`), and hand each shift
 * only its own share. 02-F23's expected cash is BY METHOD: a single scalar total is wrong for
 * four of the five tenders — `khata_credit` is not money received, `aggregator_receivable` is
 * collected by the aggregator, and `card`/`raast` never enter the drawer. Bucketing is by
 * METHOD and is never filtered by `purpose`: a khata repayment tendered in cash IS drawer cash
 * (`DEC-MONEY-007`), even though `01-F32` excludes it from the ORDER's pay_total.
 *
 * A key with one agreed member banks into the shift that member CARRIES (`26 §7`), or into
 * `02-F37`'s unbound list when it carries none. A key with several members is DISPUTED and
 * contributes ZERO everywhere — including across shifts, which is the case a per-shift map
 * cannot even see: two members disagreeing about `shift_id` are one disputed key, not two
 * agreed ones. Each member's method still appears (at zero) in the shift IT names, because
 * activity for that method WAS delivered and a vanished bucket is indistinguishable from one
 * that was never tendered.
 */
const resolveSettlements = (
  pay: Map<string, Map<string, Payload>>,
): { byShift: Map<string, Tendered>; unbound: UnboundRow[] } => {
  const byShift = new Map<string, Tendered>();
  const unbound: UnboundRow[] = [];
  for (const attempt of [...pay.keys()].sort()) {
    const members = [...(pay.get(attempt) as Map<string, Payload>).values()];
    const sole = members.length === 1 ? (members[0] as Payload) : null;
    if (sole !== null) {
      const shift = carriedShift(sole);
      const method = sole.method as string;
      if (shift === null) {
        // 02-F37 — never a modal, never a block, and never retro-bound by a later open.
        unbound.push({
          settlement_attempt_id: attempt,
          order_id: sole.order_id as string,
          method,
          amount_paisa: sole.amount_paisa as number,
          anomaly: "unbound_settlement",
        });
        continue;
      }
      const bucket = tenderedOf(byShift, shift);
      bucket.expected.set(
        method,
        (bucket.expected.get(method) ?? 0n) + BigInt(sole.amount_paisa as number),
      );
      continue;
    }
    let contestedUnbound = false;
    for (const member of members) {
      const shift = carriedShift(member);
      if (shift === null) {
        contestedUnbound = true;
        continue;
      }
      const bucket = tenderedOf(byShift, shift);
      bucket.disputed = true;
      const method = member.method as string;
      if (!bucket.expected.has(method)) bucket.expected.set(method, 0n);
    }
    // A disputed key that any member claims is unbound is rendered the way every other
    // contested register here is: money to ZERO, the carried scalars to null (there is no
    // agreed order or method to name), the anomaly raised, all members retained in the
    // lattice. Picking the min-`payloadHash` member would be a fold picking a winner, which
    // `01-F31` forbids in the same breath that it forbids picking by id.
    if (contestedUnbound) {
      unbound.push({
        settlement_attempt_id: attempt,
        order_id: null,
        method: null,
        amount_paisa: 0,
        anomaly: "unbound_settlement_divergence",
      });
    }
  }
  return { byShift, unbound };
};

const shiftRowOf = (
  shift_id: string,
  acc: ShiftAcc,
  forked: boolean,
  tendered: Tendered | undefined,
): ShiftRow => {
  const exceptions = new Set<string>();
  if (forked) exceptions.add("shift_open_fork");
  const open = agreed(openMembers(acc.opens), "shift_open_divergence", exceptions);

  if (tendered?.disputed === true) exceptions.add("attempt_divergence");
  const expectedRendered: Record<string, number> = {};
  for (const [method, total] of tendered?.expected ?? []) {
    expectedRendered[method] = renderTotal(total, exceptions);
  }

  // 26 §7 / 02-F23: the close's facts travel ON the close event and are frozen there.
  const close = agreed(acc.closes, "shift_close_divergence", exceptions);
  const counted = close.counted_cash_paisa as number | undefined;
  const atClose = close.expected_paisa_by_method as Record<string, number> | undefined;
  let atCloseJson: string | null = null;
  let variance: number | null = null;
  if (atClose !== undefined) {
    atCloseJson = canonicalJson(atClose);
    // Over/short is `26 §7`'s CARRIED FACT and `registry.ts` requires it on the close, so it
    // is READ, not re-derived: recomputing it here would silently move a number the cashier
    // already signed the moment a late payment arrived (`01-F1`). The derivation survives
    // ONLY as the fallback for a close that carries no variance — over is POSITIVE, short is
    // negative, against the expected CASH figure the cashier was shown (the non-cash buckets
    // are reconciled elsewhere and never enter the drawer variance).
    variance =
      typeof close.variance_paisa === "number"
        ? close.variance_paisa
        : renderTotal(BigInt(counted as number) - BigInt(atClose.cash as number), exceptions);
  }

  return {
    shift_id,
    cashier: (open.cashier as string | null | undefined) ?? null,
    prev_shift_id: (open.prev_shift_id as string | null | undefined) ?? null,
    open_at: earliest(acc.opens),
    expected_json: canonicalJson(expectedRendered),
    paid_out_paisa: renderTotal(sumOf(acc.paidOut.values()), exceptions),
    no_sale_count: acc.noSale.size,
    closed: acc.closes.size > 0 ? 1 : 0,
    counted_cash_paisa: counted ?? null,
    expected_at_close_json: atCloseJson,
    variance_paisa: variance,
    exceptions_json: canonicalJson([...exceptions].sort()),
  };
};

const dayRowOf = (day_id: string, acc: DayAcc, forked: boolean): DayRow => {
  const exceptions = new Set<string>();
  if (forked) exceptions.add("day_open_fork");
  const open = agreed(openMembers(acc.opens), "day_open_divergence", exceptions);
  const close = agreed(acc.closes, "day_close_divergence", exceptions);
  return {
    day_id,
    // 01-F46: the boundary is Asia/Karachi at the configurable 05:00 cutover, so a day
    // opened at 01:30 belongs to the night it was actually served. Derived through the
    // domain helper — the arithmetic is declared once (18 §2).
    business_date: businessDate(earliest(acc.opens)),
    prev_day_id: (open.prev_day_id as string | null | undefined) ?? null,
    opening_float_paisa: (open.opening_float_paisa as number | undefined) ?? 0,
    deposit_paisa: renderTotal(sumOf(acc.deposits.values()), exceptions),
    closed: acc.closes.size > 0 ? 1 : 0,
    counted_cash_paisa: (close.counted_cash_paisa as number | undefined) ?? null,
    exceptions_json: canonicalJson([...exceptions].sort()),
  };
};

/**
 * `02-F43`'s bucket: the drawer activity that named no shift, COUNTED. `02-F21`'s `no_sale`
 * discriminator governs the count on this path exactly as it does on a shift row; the anomaly
 * is raised for EVERY unbound drawer event, because being unbound is itself the fact the FR
 * asks the manager's reconciliation and the cashier's day view to see.
 */
const unboundDrawerOf = (state: ShiftCashState): UnboundDrawerRow => {
  const exceptions = new Set<string>();
  if (state.unboundDrawer.size > 0) exceptions.add("unbound_drawer_open");
  if (state.unboundPaidOut.size > 0) exceptions.add("unbound_paid_out");
  let noSale = 0;
  for (const reason of state.unboundDrawer.values()) if (reason === NO_SALE) noSale += 1;
  return {
    no_sale_count: noSale,
    paid_out_paisa: renderTotal(sumOf(state.unboundPaidOut.values()), exceptions),
    exceptions_json: canonicalJson([...exceptions].sort()),
  };
};

/** Project the whole fold — pure and repeatable, a function of the delivered SET alone. */
export const projectShiftCash = (state: ShiftCashState): ShiftCashProjection => {
  const settled = resolveSettlements(state.pay);
  const forkedShifts = forkedBy(state.shifts, "prev_shift_id");
  const forkedDays = forkedBy(state.days, "prev_day_id");
  const shifts = rowsOf(state.shifts, (id, acc) =>
    shiftRowOf(id, acc, forkedShifts.has(id), settled.byShift.get(id)),
  );
  const days = rowsOf(state.days, (id, acc) => dayRowOf(id, acc, forkedDays.has(id)));
  return {
    shifts,
    days,
    // Already sorted by attempt key: `resolveSettlements` walks `pay` in sorted key order, so
    // row order carries no trace of delivery order (01-F34).
    unbound: settled.unbound,
    unbound_drawer: unboundDrawerOf(state),
  };
};
