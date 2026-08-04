// S-2 oracle builders — the `shift_cash` fold (expected cash by method, over/short,
// the shift/day lifecycle).
//
// Authored from SPEC TEXT ONLY (24 §3 step 2 — read-only to the implementing session):
//   specs/02-pos-app.md   — 02-F12 (the tender vocabulary), 02-F21 (no-sale drawer
//                           opens are "logged and COUNTED"), 02-F22 (day open / shift open;
//                           "a shift binds subsequent cash settlements and drawer events"),
//                           02-F23 (expected cash BY METHOD vs counted cash; over/short
//                           recorded), 02-F24 (day close + deposit), 02-F26 (paid-outs),
//                           02-F37 (settling with NO shift open SUCCEEDS).
//   specs/01-kernel-sync.md — 01-F17 (never block the sale), 01-F30 (conservation),
//                           01-F31 (attempt keys: unique-keyed sums, a fold never picks a
//                           winner), 01-F32 + DEC-MONEY-007 (the fifth tender and the
//                           purpose discriminator), 01-F34 (folds read NO ordering
//                           metadata), 01-F43..01-F46 (branch-consensus time stamped at
//                           append; the Asia/Karachi 05:00 business day).
//   specs/26-merge-semantics.md — §7 in full (the "looks like ordering / actually needs"
//                           table IS the design of this fold: bucketing a payment is a
//                           CARRIED KEY; over/short is a CARRIED FACT; duplicate shift/day
//                           open needs a CARRIED CAUSAL LINK; `shifts.open_at` and
//                           `day.business_date` need a TIME SOURCE) and §8's binding lesson.
//   specs/00-platform-overview.md §6 — money = integer paisas; ids are UUIDv7.
//   packages/sync-client/FOLDS.md line 15 — the fold's declared shape and owners.
//
// ── WHY THE PURE FOLD IS THE PRIMARY SURFACE ────────────────────────────────
// FOLDS.md line 7 declares every fold a pure `(state, envelope) → state`, commutative
// and idempotent. 26 §8 reports the prototypes enforcing the 01-F34 no-ordering-metadata
// law DYNAMICALLY — Proxy-poisoned envelopes that THROW on an ordering-metadata read —
// which is only expressible against a fold you can call directly. So this oracle drives
// the pure function, and a separate (small) file drives the same behaviour through the
// device store's ingest path where 01-F17's "never block a sale" actually lives.
//
// ── THE TWO ORCHESTRATOR RULINGS THIS FILE ENCODES (the S-1 ↔ S-2 contract conflict) ──
// S-1 (`packages/domain/src/__acceptance__/service-surface-schemas.test.ts`) and this suite were
// authored independently from the same FRs and disagreed about the `shift.closed` payload, so no
// implementation could have satisfied both. Both rulings went S-1's way and S-2's builders moved;
// S-1 was not touched. Recorded here so the implementer reads the reasoning, not just the shape.
//
//  RULING 1 — the field is `expected_paisa_by_method`, never `expected_by_method`.
//    This repo names a money field with its UNIT in the name: `amount_paisa`,
//    `opening_float_paisa`, `unit_price_paisa`, `price_paisa`, and this fold's own
//    `counted_cash_paisa` / `variance_paisa` / `paid_out_paisa`. `expected_by_method` drops the
//    unit, which is precisely the ambiguity `00 §6` and standing law 3 exist to prevent — money
//    is integers-in-a-double, and a field whose unit is implicit is how a rupee/paisa confusion
//    enters a ledger `01-F1` will not let anyone correct in place afterwards.
//
//  RULING 2 — the by-method map is EXHAUSTIVE over the closed tender set, with an explicit `0`.
//    The founder ruled this EXACT ambiguity for `01-F60` in July 2026: a free modifier carries an
//    explicit `0` on every enabled pair, because "this costs nothing" and "somebody forgot
//    foodpanda" are otherwise indistinguishable. The identical argument holds here and the stakes
//    are higher — an expected-cash map missing `raast` cannot be told apart from "no RAAST
//    payments this shift" versus "the RAAST bucket was dropped", and at shift close that is an
//    unattributable cash variance in an append-only ledger. The closed set is `PAYMENT_METHODS`
//    (`02-F12` + `01-F32`); `expectedPaisaByMethod()` below fills the zeros so no fixture in this
//    suite can emit a partial map, and `shiftClosed` refuses an off-catalog key.
//
//  ⚠ THESE ARE TWO DIFFERENT OBJECTS AND BOTH READINGS ARE RIGHT ABOUT THEIR OWN ONE.
//    `expected_json` — the fold's LIVE accumulator — stays GROW-ONLY: a method appears iff
//    activity for it was delivered, and a zero row is NOT projected for an untendered one. That
//    is a merge/convergence property (`26 §7`, FOLDS.md line 7) and ruling 2 does not touch it.
//    `expected_paisa_by_method` is a SNAPSHOT on the close EVENT, carried verbatim into
//    `expected_at_close_json`. Grow-only live map + exhaustive carried snapshot are compatible,
//    and the gap between them is now LOAD-BEARING: a fold that filled `expected_at_close_json`
//    by copying the live map at close time reads a 1-key map where the carried 5-key one is
//    required and fails ./shift-cash-fold.test.ts §3. Before ruling 2 that defect was invisible,
//    because the live map and the close payload were the same one-key object.
//
// ── ORACLE-PINNED SURFACE (binding for the implementing session) ────────────
// Pinned from FOLDS.md line 15 + the FRs above. Where the FRs left a choice open it is
// named as PINNED below and reported as a finding — a deviation is a contract-clarification
// event, not a test defect.
//
//   `@restos/sync-client/fold-engine` (src/fold-engine.ts) re-exports, from a new
//   `src/folds/shift-cash.ts`:
//     emptyShiftCash(): ShiftCashState
//     foldShiftCash(state, envelope): ShiftCashState     — pure, commutative, idempotent
//     projectShiftCash(state): ShiftCashProjection       — pure, repeatable
//   The pure subpath is deliberate: `fold-engine.ts` exists precisely so the cloud
//   Auditor can refold without loading the better-sqlite3 addon, and a money fold the
//   Auditor cannot refold is unauditable.
//
//   shifts[] row (FOLDS.md line 15 gives `shift_id PK, cashier, open_at, expected_json,
//   closed` VERBATIM; the rest are named additions):
//     shift_id                 — PK, carried on shift.opened.
//     cashier                  — carried, NULLABLE. No identity LAYER exists yet (`actor_user_id`
//                                is nullable and the POS hardcodes it null), so nothing here
//                                assumes a non-null cashier is REQUIRED — that is S-0b/c's suite.
//                                It is nonetheless one of the five columns FOLDS.md line 15 gives
//                                verbatim, so the tests DO carry non-default values and assert
//                                the column is keyed per shift.
//                                ⚠ **PIN #2 — THE CASHIER SOURCE. An interpretation, NOT quoted
//                                FR text.** No FR determines whether the fold reads
//                                `payload.cashier` or the envelope's `actor_user_id`: 02-F19 says
//                                "every action is attributed in the event envelope" while
//                                FOLDS.md line 15 names a `cashier` COLUMN, and the two do not
//                                jointly decide a source. The pin is therefore SOURCE-AGNOSTIC —
//                                every fixture puts the SAME value on both surfaces, so the
//                                assertions pin the CARRY (a cashier keyed per shift) and no
//                                assertion in this suite can distinguish the two mechanisms.
//                                An implementer may pick either; that the corpus leaves it open
//                                is REPORTED AS A FINDING, not settled here.
//                                Asserted in ./shift-cash-fold.test.ts §8 ("`cashier` is carried
//                                and keyed PER SHIFT").
//     prev_shift_id            — 26 §7's CARRIED CAUSAL LINK, nullable.
//     open_at                  — 26 §7 "a time source": the event's `branch_created_at`
//                                (01-F43), NEVER `device_created_at` (01-F45).
//     expected_json            — canonical JSON Record<PaymentMethod, paisa>: the LIVE
//                                expected cash BY METHOD (02-F23). PINNED: grow-only map
//                                union — a method appears iff activity for it was delivered
//                                (zero-valued keys for untendered methods are NOT projected).
//                                This is the MERGE property and ruling 2 does NOT reach it: the
//                                exhaustive map is the close EVENT's snapshot, not this
//                                accumulator. See the ruling block above.
//     paid_out_paisa           — Σ cash.paid_out on this shift (02-F26). PINNED as its own
//                                total rather than netted into expected_json.cash: whether a
//                                paid-out reduces the expected DRAWER figure or is reported
//                                beside it is not determined by 02-F23/02-F26 (finding).
//     no_sale_count            — 02-F21 "logged and counted": count of DISTINCT
//                                cash.drawer_opened events with reason `no_sale`.
//     closed (0|1)             — monotone fact over shift.closed. Nothing un-closes a shift.
//     counted_cash_paisa       — 02-F23/26 §7 CARRIED FACT, null until closed.
//     expected_at_close_json   — the by-method figure the cashier was SHOWN at close, carried
//                                verbatim (26 §7: "the counted figure and the expected figure
//                                that the cashier was shown are both facts at close time").
//                                Null until closed. A read-time recompute of this column is
//                                the defect 26 §7 names — and under ruling 2 it is now
//                                DETECTABLE: the carried snapshot is EXHAUSTIVE (five keys,
//                                explicit zeros) while the live `expected_json` is grow-only, so
//                                a column filled by copying the live map at close time no longer
//                                matches.
//     variance_paisa           — over/short: `counted_cash_paisa − expected_at_close.cash`,
//                                a pure function of two CARRIED facts and therefore frozen at
//                                close. PINNED sign convention: counted ABOVE expected is
//                                POSITIVE (over), below is negative (short). Null until closed.
//     exceptions_json          — canonical JSON sorted distinct string[] (the house anomaly
//                                vector, as on openOrders()).
//
//   days[] row:
//     day_id                   — PK, carried on day.opened.
//     business_date            — DERIVED, not carried: 26 §7 puts `day.business_date` under
//                                "a time source", and 01-F46 owns the boundary. It is
//                                `businessDate(branch_created_at)` from `@restos/domain` at
//                                the default 05:00 Asia/Karachi cutover. This oracle never
//                                reimplements that arithmetic — it asserts THROUGH the helper.
//     prev_day_id              — 26 §7 carried causal link, nullable.
//     opening_float_paisa      — 02-F22 float entry, carried on day.opened. A genuine
//                                REDELIVERY (a second envelope with an IDENTICAL payload) is
//                                idempotent and changes nothing.
//                                ⚠ **PIN #1 — THE DIVERGENCE RULE. An interpretation, NOT quoted
//                                FR text.** For the DIVERGENT case — two `day.opened` for one
//                                `day_id` carrying DIFFERENT floats, which is two concurrent
//                                heads and not a redelivery at all: neither is picked, the value
//                                contributes **ZERO**, and the row raises a `/diverg/` anomaly
//                                with both members retained.
//                                A DERIVATION BY ANALOGY, not a preference: 01-F34 enumerates the legal
//                                merge rules and the only one that can hold two disagreeing
//                                scalars is "an explicitly rendered contested set"; 01-F31 gives
//                                that rule its shape ("members diverging in *any* field mark the
//                                key disputed, contribute **zero**, raise an anomaly, and are all
//                                retained; a fold never picks a winner") and 01-F58 already
//                                applies that same clause outside the payment domain; standing
//                                law 3 does the same for a total it cannot represent. **No FR
//                                states any of this for a day float** — the analogy is the whole
//                                argument, and it is REPORTED AS A FINDING for the implementer to
//                                contest rather than discover. Because it is a pin, the property
//                                that IS determined (the outcome depends on neither envelope id
//                                nor delivery order — 01-F34, 26 §8) is asserted SEPARATELY, so
//                                the min-id kill never rests on the pin.
//                                Asserted in ./shift-cash-fold.test.ts §8 ("two `day.opened` for
//                                ONE day whose floats DISAGREE").
//     deposit_paisa            — Σ cash.deposit_recorded on this day (02-F24).
//     closed (0|1)             — monotone over day.closed.
//     counted_cash_paisa       — 02-F24 manager count, carried; null until closed.
//     exceptions_json          — as above.
//
//   unbound[] row (02-F37 — the whole point of the FR):
//     { settlement_attempt_id, order_id, method, amount_paisa, anomaly } where `anomaly` is
//     the string `unbound_settlement` — the FR names that code, so this suite asserts the
//     name and not merely that something was flagged.
//
//   Row ORDER is part of the projection: `shifts` by shift_id, `days` by day_id, `unbound`
//   by settlement_attempt_id, each by UTF-16 code unit. A fold that returns rows in
//   insertion order has made delivery order observable (01-F34), so this is not cosmetic.
//
// ── ANOMALY CODES: exact where the spec names one, CLASS where it does not ──
//   `unbound_settlement`  EXACT — 02-F37 writes it.
//   /overflow/            CLASS — standing law 3's `money_overflow` greps to no spec; the
//                         package's existing fold-money-guard oracle pins the class for the
//                         same reason. Recommended spelling: `money_overflow`.
//   /diverg/              CLASS — 01-F31 mandates the behaviour (disputed key contributes
//                         zero, members retained, anomaly raised) and names no code. The
//                         engine already spells it `attempt_divergence`. The SAME class covers
//                         a divergent duplicate OPEN (two `day.opened` for one `day_id` whose
//                         floats disagree): 01-F31's clause is about a key whose members
//                         disagree, which is exactly what that is. Recommended spelling for
//                         that one: `day_open_divergence`. Flagged as a finding.
//   /fork/                CLASS — 26 §7 mandates the carried causal link and says nothing
//                         about surfacing the duplicate. Recommended: `shift_open_fork` /
//                         `day_open_fork`. Flagged as a finding. A FORK is two DISTINCT ids
//                         naming one predecessor; a DIVERGENCE is one id under two payloads.
//                         They are different anomalies and both negative cases are exercised.
//
// ── DELIBERATELY NOT TESTED (findings, not omissions) ───────────────────────
//   * `payment.refunded` carries NO shift key (S-1's brief pins the carried key to
//     `payment.recorded` only), so a cash refund cannot be bucketed into a shift without
//     asking "which shift is open" — the exact 26 §7 break. No test here buckets a refund.
//   * The `shift_close_slip` / day-summary ticket (02-F24) — no printer exists (K-8 owed).
//   * Anything requiring a real cashier identity (S-0b/c).
//   * Two DIVERGENT closes of one shift, and the layer-2 cutover-hour override.
//   * **`payment.split_recorded` (02-F13).** FOLDS.md line 15 declares this fold consumes
//     `payment.*`, and the type is in the `01 §4` catalog — but `26 §7` records that it "has
//     no payload schema at all", S-1 lists it under its own DELIBERATELY-NOT-COVERED block,
//     and 02-F13's one sentence names no field. A test would therefore have to INVENT the
//     shape (commandment 2), and every other name this file pins is derived from FR text.
//     So the FR is NOT cited as a source above and no test claims it. **The hazard is named
//     so it is not lost:** a fold matching `payment.*` and reading a top-level
//     `method`/`amount_paisa` sees neither on a split, so a part-cash/part-RAAST settlement
//     contributes NOTHING to expected cash and the drawer silently reads short. Closing it
//     needs the payload schema first — a spec/S-1 item, reported as a finding.

import { businessDate, PAYMENT_METHODS } from "@restos/domain";
import * as foldEngine from "../fold-engine.js";
import { openStore } from "../index.js";
import { canonicalJson, type Identity, must, peerEnvelope, seededRng } from "./builders.js";
import { type MergeStore, relabelEnvelope, reversingIdMap } from "./merge-builders.js";

export { businessDate, PAYMENT_METHODS };

// ---------------------------------------------------------------------------
// The pinned projection shapes.
// ---------------------------------------------------------------------------

export type ShiftRow = {
  shift_id: string;
  cashier: string | null;
  prev_shift_id: string | null;
  open_at: number;
  expected_json: string;
  paid_out_paisa: number;
  no_sale_count: number;
  closed: number;
  counted_cash_paisa: number | null;
  expected_at_close_json: string | null;
  variance_paisa: number | null;
  exceptions_json: string;
};

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

export type UnboundRow = {
  settlement_attempt_id: string;
  order_id: string;
  method: string;
  amount_paisa: number;
  anomaly: string;
};

export type ShiftCashProjection = {
  shifts: ShiftRow[];
  days: DayRow[];
  unbound: UnboundRow[];
};

/** Opaque — the fold's internal accumulator is an implementation choice (18 §4). */
export type ShiftCashState = { readonly __shift_cash_state: unique symbol };

export type ShiftCashFold = {
  empty: () => ShiftCashState;
  fold: (state: ShiftCashState, envelope: unknown) => ShiftCashState;
  project: (state: ShiftCashState) => ShiftCashProjection;
  /** Convenience: fold a whole delivery from empty. */
  foldAll: (envelopes: readonly unknown[]) => ShiftCashState;
  /** Convenience: the projection of a whole delivery from empty. */
  projectAll: (envelopes: readonly unknown[]) => ShiftCashProjection;
};

type MaybeModule = Partial<{
  emptyShiftCash: () => ShiftCashState;
  foldShiftCash: (state: ShiftCashState, envelope: unknown) => ShiftCashState;
  projectShiftCash: (state: ShiftCashState) => ShiftCashProjection;
}>;

const RED =
  "S-2 red-awaiting-implementation: `@restos/sync-client/fold-engine` must export " +
  "`%s` (the pure shift_cash fold — FOLDS.md line 7/15, 26 §8). Implement it in " +
  "src/folds/shift-cash.ts and re-export it from src/fold-engine.ts.";

/**
 * The fold under test. Resolved through a NAMESPACE import so a not-yet-written export is a
 * loud per-test failure naming the missing symbol, rather than a module-level link error that
 * would collapse the whole file into one uninformative red.
 */
export const shiftCash = (): ShiftCashFold => {
  const mod = foldEngine as unknown as MaybeModule;
  const pick = <K extends keyof MaybeModule>(name: K): NonNullable<MaybeModule[K]> => {
    const fn = mod[name];
    if (typeof fn !== "function") throw new Error(RED.replace("%s", name));
    return fn as NonNullable<MaybeModule[K]>;
  };
  const empty = pick("emptyShiftCash");
  const fold = pick("foldShiftCash");
  const project = pick("projectShiftCash");
  const foldAll = (envelopes: readonly unknown[]): ShiftCashState => {
    let state = empty();
    for (const env of envelopes) state = fold(state, env);
    return state;
  };
  return { empty, fold, project, foldAll, projectAll: (e) => project(foldAll(e)) };
};

/** MergeStore + the S-2 additions, typed standalone so this oracle compiles against the
 * CONTRACT — a missing member fails the red run loudly at runtime. */
export type ShiftCashStore = MergeStore & {
  shifts(): ShiftRow[];
  days(): DayRow[];
  unboundSettlements(): UnboundRow[];
};

export const shiftCashStore = (id: Identity, path = ":memory:"): ShiftCashStore =>
  openStore({ path, identity: id }) as unknown as ShiftCashStore;

/** Resolved BEFORE any behavioural assertion so a missing method is a distinct red, never a
 * false green on a guard (the merge-tables `requireDrop` pattern). */
export const requireShiftRows = (store: ShiftCashStore): (() => ShiftRow[]) => {
  const fn = store.shifts;
  if (typeof fn !== "function")
    throw new Error("S-2 red-awaiting-implementation: store.shifts() is not implemented yet");
  return fn.bind(store);
};

export const requireUnbound = (store: ShiftCashStore): (() => UnboundRow[]) => {
  const fn = store.unboundSettlements;
  if (typeof fn !== "function")
    throw new Error(
      "S-2 red-awaiting-implementation: store.unboundSettlements() is not implemented yet",
    );
  return fn.bind(store);
};

// ---------------------------------------------------------------------------
// Payload fragments. S-1 owns these schemas; this file pins only the field NAMES the
// fold reads, from the FR text that determines each one. A rename is a
// contract-clarification event (reported), not a test defect.
// ---------------------------------------------------------------------------

export const shiftOpened = (
  shift_id: string,
  extra: { cashier?: string | null; prev_shift_id?: string | null } = {},
) => ({
  type: "shift.opened",
  payload: {
    shift_id,
    // NULLABLE by construction — no identity exists yet (brief, S-1/S-2 constraint).
    cashier: extra.cashier ?? null,
    // 26 §7: the carried causal link that makes a duplicate open detectable.
    prev_shift_id: extra.prev_shift_id ?? null,
  },
});

/**
 * ORCHESTRATOR RULING 2 (see the header) — the close's by-method map is EXHAUSTIVE over the
 * closed tender set (`PAYMENT_METHODS`; `02-F12` + `01-F32`), carrying an explicit `0` for every
 * method that saw nothing. Callers name only the tenders that saw activity and the zeros are
 * filled here, so no fixture in this suite can emit a partial map and later drift back into the
 * S-1 conflict this ruling closed. An off-catalog key is a FIXTURE defect and throws: S-1 refuses
 * a sixth category at the schema, so a fixture carrying one would be unemittable in production.
 *
 * NOT to be confused with the fold's LIVE `expected_json`, which stays grow-only. The two are
 * different objects — see the ⚠ block in the header.
 */
export const expectedPaisaByMethod = (
  tendered: Record<string, number> = {},
): Record<string, number> => {
  const offCatalog = Object.keys(tendered).filter(
    (method) => !(PAYMENT_METHODS as readonly string[]).includes(method),
  );
  if (offCatalog.length > 0)
    throw new Error(
      `fixture defect: \`${offCatalog.join("`, `")}\` is outside the closed tender set ` +
        `(02-F12 + 01-F32: ${PAYMENT_METHODS.join(", ")})`,
    );
  const exhaustive: Record<string, number> = {};
  for (const method of PAYMENT_METHODS) exhaustive[method] = tendered[method] ?? 0;
  return exhaustive;
};

/** 02-F23 / 26 §7: BOTH facts travel on the close — what was counted, and the by-method
 * figure the cashier was shown. The field name is ORCHESTRATOR RULING 1's
 * `expected_paisa_by_method` (S-1's name; the unit belongs in a money field's name) and the map
 * is ruling 2's exhaustive one. */
export const shiftClosed = (
  shift_id: string,
  opts: { counted_cash_paisa: number; expected_paisa_by_method: Record<string, number> },
) => ({
  type: "shift.closed",
  payload: {
    shift_id,
    counted_cash_paisa: opts.counted_cash_paisa,
    expected_paisa_by_method: expectedPaisaByMethod(opts.expected_paisa_by_method),
  },
});

export const dayOpened = (
  day_id: string,
  opts: { opening_float_paisa: number; prev_day_id?: string | null },
) => ({
  type: "day.opened",
  payload: {
    day_id,
    opening_float_paisa: opts.opening_float_paisa,
    prev_day_id: opts.prev_day_id ?? null,
  },
});

export const dayClosed = (day_id: string, opts: { counted_cash_paisa: number }) => ({
  type: "day.closed",
  payload: { day_id, counted_cash_paisa: opts.counted_cash_paisa },
});

export const depositRecorded = (day_id: string, amount_paisa: number) => ({
  type: "cash.deposit_recorded",
  payload: { day_id, amount_paisa },
});

export const paidOut = (
  shift_id: string,
  amount_paisa: number,
  extra: Record<string, unknown> = {},
) => ({
  type: "cash.paid_out",
  payload: {
    shift_id,
    amount_paisa,
    reason: "petty_cash",
    receipt_ref: "obj://receipt",
    ...extra,
  },
});

/**
 * A drawer open whose reason is NOT `no_sale`. 02-F21 counts one reason and one only, and its
 * phrasing ("No-sale drawer opens: `cash.drawer_opened` with `reason=no_sale`") presupposes the
 * others exist; S-1 declines to close the reason set for the same reason. The literal value here
 * is therefore arbitrary and carries no claim — the only spec fact under test is that
 * `no_sale` is the discriminator, so anything else must not land in `no_sale_count`.
 */
export const NOT_NO_SALE_REASON = "cash_settlement";

/** 02-F21: the classic theft vector — logged and COUNTED, but only for `reason=no_sale`. */
export const drawerOpened = (shift_id: string, reason = "no_sale") => ({
  type: "cash.drawer_opened",
  payload: { shift_id, reason },
});

/**
 * `payment.recorded` + the 26 §7 CARRIED shift key. `shift_id: null` is the 02-F37 path and
 * is a first-class legal value, never an error.
 *
 * `method` is the closed `PAYMENT_METHODS` enum (02-F12 + 01-F32's fifth tender); `purpose`
 * is DEC-MONEY-007's discriminator. Both already exist in the registry, so a payment carrying
 * an extra `shift_id` is schema-valid TODAY (payload schemas are `z.looseObject`).
 */
export const shiftPayment = (
  order_id: string,
  amount_paisa: number,
  opts: {
    attempt: string;
    shift_id: string | null;
    method?: string;
    purpose?: "settles_order" | "repays_receivable";
  },
) => ({
  type: "payment.recorded",
  payload: {
    order_id,
    amount_paisa,
    method: opts.method ?? "cash",
    purpose: opts.purpose ?? "settles_order",
    settlement_attempt_id: opts.attempt,
    shift_id: opts.shift_id,
  },
});

// ---------------------------------------------------------------------------
// Envelopes. Every fixture's device clock is YEARS away from its branch stamp and moves
// in the OPPOSITE direction, so a fold reading `device_created_at` (01-F45) produces a
// visibly wrong answer instead of an accidentally right one.
// ---------------------------------------------------------------------------

/** The branch's true shared instant at scenario start. 2025-07-18T02:13:20Z. */
export const BRANCH_T0 = 1752800000000;

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const shiftEnvelope = (
  peer: Identity,
  lamport_seq: number,
  typed: { type: string; payload: Record<string, unknown> },
  opts: {
    branch_at: number;
    id?: string;
    basis?: "branch" | "branch_provisional";
    /** 02-F19: attribution rides the envelope. Set alongside `payload.cashier` so the
     * `cashier` column can be asserted without pinning WHICH of the two the fold reads. */
    actor_user_id?: string | null;
  },
): Record<string, unknown> & { id: string } => {
  const delta = opts.branch_at - BRANCH_T0;
  const env = peerEnvelope(peer, lamport_seq, {
    branch_created_at: opts.branch_at,
    // Inverted and years off (01-F45's untrusted forensic hint).
    device_created_at: BRANCH_T0 + 4 * YEAR_MS - delta * 2,
    time_basis: opts.basis ?? "branch",
    ...(opts.id === undefined ? {} : { id: opts.id }),
    ...(opts.actor_user_id === undefined ? {} : { actor_user_id: opts.actor_user_id }),
    ...typed,
  });
  return env as Record<string, unknown> & { id: string };
};

// ---------------------------------------------------------------------------
// Projection helpers.
// ---------------------------------------------------------------------------

export const projectionBytes = (proj: ShiftCashProjection): string => canonicalJson(proj);

export const shiftRow = (proj: ShiftCashProjection, shift_id: string): ShiftRow =>
  must(
    proj.shifts.find((r) => r.shift_id === shift_id),
    `shift row ${shift_id}`,
  );

export const dayRow = (proj: ShiftCashProjection, day_id: string): DayRow =>
  must(
    proj.days.find((r) => r.day_id === day_id),
    `day row ${day_id}`,
  );

export const expectedOf = (row: { expected_json: string }): Record<string, number> =>
  JSON.parse(row.expected_json) as Record<string, number>;

export const expectedAtCloseOf = (row: ShiftRow): Record<string, number> | null =>
  row.expected_at_close_json === null
    ? null
    : (JSON.parse(row.expected_at_close_json) as Record<string, number>);

export const exceptionsOf = (row: { exceptions_json: string }): string[] =>
  JSON.parse(row.exceptions_json) as string[];

export const hasCode = (row: { exceptions_json: string }, pattern: RegExp): boolean =>
  exceptionsOf(row).some((code) => pattern.test(code));

/** The EXACT total, computed outside the fold in BigInt. Never `reduce((a, b) => a + b)` —
 * that is the very double arithmetic under test (standing law 3). */
export const exactSum = (values: readonly number[]): bigint =>
  values.reduce<bigint>((acc, v) => acc + BigInt(v), 0n);

export const MAX_SAFE = Number.MAX_SAFE_INTEGER;

// ---------------------------------------------------------------------------
// 01-F34 adversaries.
// ---------------------------------------------------------------------------

/** The four fields 01-F34 + 01-F45 ban a fold from reading. */
export const BANNED_METADATA = [
  "global_seq",
  "lamport_seq",
  "device_created_at",
  "server_received_at",
] as const;

const isBanned = (prop: string | symbol): prop is string =>
  typeof prop === "string" && (BANNED_METADATA as readonly string[]).includes(prop);

/**
 * 26 §8's dynamic enforcement, ported: an envelope that THROWS the moment the fold reads a
 * piece of ordering metadata. Far stronger than an after-the-fact equality check, because it
 * names the offending field at the moment of the read.
 *
 * The banned keys are hidden from `ownKeys`/`getOwnPropertyDescriptor` on purpose, so an
 * ordinary `{...envelope}` or `Object.keys(envelope)` does not trip the wire — copying an
 * envelope is not reading a value out of it. A direct `envelope.lamport_seq` does trip it,
 * and a fold that copies first and reads from the copy gets `undefined` and diverges under
 * the injection tests instead. Both nets are set.
 */
export const poisoned = <T extends Record<string, unknown>>(env: T): T =>
  new Proxy(env, {
    get(target, prop, receiver) {
      if (isBanned(prop))
        throw new Error(
          `01-F34 violation: the shift_cash fold read ordering metadata \`${String(prop)}\``,
        );
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      if (isBanned(prop)) return false;
      return Reflect.has(target, prop);
    },
    ownKeys(target) {
      return Reflect.ownKeys(target).filter((k) => !isBanned(k));
    },
    getOwnPropertyDescriptor(target, prop) {
      if (isBanned(prop)) return undefined;
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  }) as T;

/** Garbage clock + lamport + global_seq injection: same ids, same payloads, same devices,
 * same BRANCH stamps — only the banned fields move. A fold reading any of them diverges. */
export const injectGarbageMetadata = <T extends Record<string, unknown>>(
  envelopes: readonly T[],
): T[] =>
  envelopes.map((env, i) => ({
    ...env,
    device_created_at: BRANCH_T0 - (i + 1) * 9_999_991 - 3 * YEAR_MS,
    lamport_seq: 100_000 + (envelopes.length - i) * 7,
    global_seq: 900_000 - i * 13,
    server_received_at: BRANCH_T0 + (envelopes.length - i) * 1_234_567,
  }));

/** Move every BRANCH stamp — the one clock the fold IS allowed to read (01-F43). Used as the
 * anti-vacuity twin of the injection test: if this does NOT move the projection, the fold is
 * reading no time at all and the injection test proved nothing. */
export const shiftBranchStamps = <T extends Record<string, unknown>>(
  envelopes: readonly T[],
  delta_ms: number,
): T[] =>
  envelopes.map((env) => ({
    ...env,
    branch_created_at: (env.branch_created_at as number) + delta_ms,
  }));

/**
 * 26 §8's binding lesson as one call: an ORDER-REVERSING bijection over the set's envelope ids.
 * Returns the adversary's own proof of non-vacuity alongside it — `reversing` is true only when
 * φ genuinely inverts the id order (so a min-id **or** max-id tiebreak must change its answer),
 * and `bijective` only when no two ids collapsed. A test that skips those two flags is asserting
 * against a possible identity map, which is the round-2 §C "guard passed by not looking" shape.
 */
export const reversedIds = <T extends Record<string, unknown> & { id: string }>(
  envelopes: readonly T[],
): {
  envelopes: T[];
  map: ReadonlyMap<string, string>;
  reversing: boolean;
  bijective: boolean;
} => {
  const ids = envelopes.map((e) => e.id);
  const map = reversingIdMap(ids);
  const images = [...ids].sort().map((id) => must(map.get(id), "relabel image"));
  return {
    envelopes: envelopes.map((env) => relabelEnvelope(env, map) as T),
    map,
    // Ascending in the source ids ⇒ strictly DESCENDING in their images.
    reversing:
      images.length > 1 && canonicalJson(images) === canonicalJson([...images].sort().reverse()),
    bijective: new Set(images).size === images.length,
  };
};

// ---------------------------------------------------------------------------
// The rich directed scenario — every merge rule this fold owns, in one set.
// ---------------------------------------------------------------------------

export type ShiftCashSet = {
  identity: Identity;
  envelopes: Array<Record<string, unknown> & { id: string }>;
};

export type BranchEmitter = ShiftCashSet & {
  /** `emit(deviceIndex, payloadFragment, msAfterBRANCH_T0)` → the envelope id. The optional
   * fourth argument sets the envelope's 02-F19 attribution. */
  emit: (
    peerIdx: number,
    typed: { type: string; payload: Record<string, unknown> },
    offsetMs: number,
    opts?: { actor_user_id?: string | null },
  ) => string;
};

/** A three-device branch whose envelope ids are stable and readable (`<tag>-00`, …), so a
 * failing diff names the event rather than a UUID. */
export const branchEmitter = (tag: string): BranchEmitter => {
  const identity: Identity = {
    org_id: `org-${tag}`,
    branch_id: `br-${tag}`,
    device_id: `${tag}-d0`,
  };
  const peers: Identity[] = [1, 2, 3].map((i) => ({ ...identity, device_id: `${tag}-d${i}` }));
  const lamports = [0, 0, 0];
  const envelopes: Array<Record<string, unknown> & { id: string }> = [];
  const emit = (
    peerIdx: number,
    typed: { type: string; payload: Record<string, unknown> },
    offsetMs: number,
    opts: { actor_user_id?: string | null } = {},
  ): string => {
    const peer = must(peers[peerIdx], "peer");
    const lamport = must(lamports[peerIdx], "lamport");
    lamports[peerIdx] = lamport + 1;
    const id = `${tag}-${String(envelopes.length).padStart(2, "0")}`;
    envelopes.push(
      shiftEnvelope(peer, lamport, typed, {
        branch_at: BRANCH_T0 + offsetMs,
        id,
        ...(opts.actor_user_id === undefined ? {} : { actor_user_id: opts.actor_user_id }),
      }),
    );
    return id;
  };
  return { identity, envelopes, emit };
};

/** Two cashiers on the evening's roster. Non-default on purpose: `cashier` is one of the five
 * columns FOLDS.md line 15 names verbatim, and a fixture that only ever carries `null` cannot
 * tell a fold that CARRIES it from one that hardcodes it. */
export const CASHIER_A = "u-ayesha";
export const CASHIER_B = "u-bilal";

/**
 * Two devices' worth of a real evening: a day opened with a float; shift S1 opened, tendered
 * across all five methods including a khata REPAYMENT, paid out of, drawer-opened twice (plus
 * one open for a DIFFERENT reason, which is not a no-sale), then closed with a count; shift S2
 * opened after under a different cashier; a payment carrying the CLOSED shift's key arriving
 * late; a fork (two opens naming one predecessor); an unbound settlement (02-F37); a
 * double-tapped attempt key and a divergent one; deposits and a day close.
 *
 * **It also carries the 26 §8 killer: two `day.opened` for D1 whose `opening_float_paisa`
 * DISAGREE.** That case lives HERE, in the set every relabel / injection / poison net in
 * ./shift-cash-invariance.test.ts runs over, because a divergent-money case that sits outside
 * the harness is precisely what a `min(envelope.id)` fold walks through: it is convergent (so
 * plain shuffling never sees it) and wrong (so only a bijective id relabel does).
 */
export const shiftCashScenario = (): ShiftCashSet => {
  const { identity, envelopes, emit } = branchEmitter("sc");

  emit(0, dayOpened("D1", { opening_float_paisa: 500000 }), 0);
  // The second head: same day_id, DIFFERENT float. Two devices opened the day across a
  // partition. Not a redelivery — a redelivery carries the identical payload.
  emit(2, dayOpened("D1", { opening_float_paisa: 999999 }), 5);
  emit(0, shiftOpened("S1", { cashier: CASHIER_A }), 1000, { actor_user_id: CASHIER_A });
  emit(0, shiftPayment("O1", 100000, { attempt: "sa-1", shift_id: "S1" }), 2000);
  emit(1, shiftPayment("O1", 100000, { attempt: "sa-1", shift_id: "S1" }), 2100); // double tap
  emit(0, shiftPayment("O2", 250000, { attempt: "sa-2", shift_id: "S1", method: "card" }), 2200);
  emit(1, shiftPayment("O3", 50000, { attempt: "sa-3", shift_id: "S1", method: "raast" }), 2300);
  emit(
    0,
    shiftPayment("O4", 185000, { attempt: "sa-4", shift_id: "S1", method: "khata_credit" }),
    2400,
  );
  emit(
    2,
    shiftPayment("O5", 90000, {
      attempt: "sa-5",
      shift_id: "S1",
      method: "aggregator_receivable",
    }),
    2500,
  );
  emit(
    1,
    shiftPayment("O4", 40000, { attempt: "sa-6", shift_id: "S1", purpose: "repays_receivable" }),
    2600,
  );
  emit(0, shiftPayment("O6", 7000, { attempt: "sa-7", shift_id: "S1" }), 2700); // divergent …
  emit(2, shiftPayment("O6", 9000, { attempt: "sa-7", shift_id: "S1" }), 2750); // … second member
  emit(0, paidOut("S1", 12500), 2800);
  emit(0, drawerOpened("S1"), 2900);
  emit(1, drawerOpened("S1"), 2950);
  emit(1, drawerOpened("S1", NOT_NO_SALE_REASON), 2975); // 02-F21's discriminator, not a no-sale
  emit(
    0,
    // Only `cash` saw activity by close time; ruling 2's four explicit zeros are filled by the
    // builder, so this close carries the full five-key map (and is the set's non-vacuity witness
    // that an exhaustive map really does contain zeros).
    shiftClosed("S1", { counted_cash_paisa: 139000, expected_paisa_by_method: { cash: 140000 } }),
    3000,
  );
  emit(1, shiftOpened("S2", { prev_shift_id: "S1", cashier: CASHIER_B }), 3100, {
    actor_user_id: CASHIER_B,
  });
  emit(2, shiftPayment("O7", 25000, { attempt: "sa-8", shift_id: "S1" }), 3200); // LATE, keyed to S1
  emit(1, shiftPayment("O8", 60000, { attempt: "sa-9", shift_id: "S2" }), 3300);
  emit(2, shiftPayment("O9", 75000, { attempt: "sa-10", shift_id: null }), 3400); // 02-F37
  emit(1, shiftOpened("S3a", { prev_shift_id: "S2" }), 3500); // fork …
  emit(2, shiftOpened("S3b", { prev_shift_id: "S2" }), 3500); // … same predecessor
  emit(0, depositRecorded("D1", 200000), 3600);
  emit(1, depositRecorded("D1", 300000), 3650);
  emit(0, dayClosed("D1", { counted_cash_paisa: 750000 }), 3700);

  return { identity, envelopes };
};

/** The two floats the divergent-open fixtures disagree over. Exported so a test asserts against
 * the fixture's own numbers rather than re-typing them (and so "neither was picked" is a claim
 * about these two values specifically). */
export const DIVERGENT_FLOAT_A = 500000;
export const DIVERGENT_FLOAT_B = 999999;

/**
 * The 26 §8 killer, ISOLATED — two `day.opened` for one `day_id` whose `opening_float_paisa`
 * disagree, plus enough ordinary traffic that the rest of the day still has to reconcile.
 *
 * It exists beside `shiftCashScenario` (which also carries the case) so the relabel/injection/
 * poison failure is DIAGNOSTIC: a red here names the divergent float, where a red on the big
 * scenario only says "the projection moved".
 *
 * Both emitters are separate devices, and the divergent members are emitted in ASCENDING id
 * order with the SMALLER float first, so a `min(envelope.id)` tiebreak reads
 * `DIVERGENT_FLOAT_A` on the raw set and `DIVERGENT_FLOAT_B` once the ids are reversed.
 */
export const divergentDayOpenSet = (): ShiftCashSet => {
  const { identity, envelopes, emit } = branchEmitter("dv");
  emit(0, dayOpened("D1", { opening_float_paisa: DIVERGENT_FLOAT_A }), 0);
  emit(1, dayOpened("D1", { opening_float_paisa: DIVERGENT_FLOAT_B }), 10);
  emit(2, shiftOpened("S1", { cashier: CASHIER_A }), 100, { actor_user_id: CASHIER_A });
  emit(0, shiftPayment("O1", 40000, { attempt: "dv-sa-1", shift_id: "S1" }), 200);
  emit(1, depositRecorded("D1", 200000), 300);
  return { identity, envelopes };
};

/** Named seeded generator (20 §2.3) — registry-valid shift/day/cash/payment sets with forks,
 * unbound settlements, duplicate and divergent attempt keys, divergent day opens, and
 * out-of-order soft refs. */
export const generateShiftCashSet = (seed: number): ShiftCashSet => {
  const rng = seededRng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const chance = (p: number) => rng() < p;

  const identity: Identity = {
    org_id: `org-${seed}`,
    branch_id: `br-${seed}`,
    device_id: "d0-own",
  };
  const peers: Identity[] = [];
  for (let i = 1, n = int(2, 4); i <= n; i++) peers.push({ ...identity, device_id: `d${i}-peer` });
  const lamports = peers.map(() => 0);

  const envelopes: Array<Record<string, unknown> & { id: string }> = [];
  let offset = 0;
  const emit = (typed: { type: string; payload: Record<string, unknown> }): string => {
    const idx = int(0, peers.length - 1);
    const peer = must(peers[idx], "peer");
    const lamport = must(lamports[idx], "lamport");
    lamports[idx] = lamport + 1;
    offset += int(0, 3) * 100; // zero steps keep cross-device branch-stamp ties present
    const id = `g-${String(envelopes.length).padStart(3, "0")}`;
    envelopes.push(shiftEnvelope(peer, lamport, typed, { branch_at: BRANCH_T0 + offset, id }));
    return id;
  };

  let attempt = 0;
  const nextAttempt = () => `ga-${seed}-${attempt++}`;

  const float = int(0, 20) * 10000;
  emit(dayOpened("D1", { opening_float_paisa: float }));
  // 26 §7/26 §8: a second head for the SAME day whose float DISAGREES — the money case a
  // min(envelope.id) tiebreak resolves silently. `+ 1` guarantees the members really differ.
  if (chance(0.35)) emit(dayOpened("D1", { opening_float_paisa: float + 1 }));
  let prevShift: string | null = null;
  for (let s = 0, shifts = int(1, 3); s < shifts; s++) {
    const shiftId = `S${s}`;
    const cashier = chance(0.5) ? CASHIER_A : CASHIER_B;
    emit(shiftOpened(shiftId, { prev_shift_id: prevShift, cashier }));
    if (chance(0.25)) emit(shiftOpened(`${shiftId}-fork`, { prev_shift_id: prevShift })); // 26 §7
    prevShift = shiftId;

    const expected: Record<string, number> = {};
    for (let p = 0, pays = int(0, 4); p < pays; p++) {
      const method = must(PAYMENT_METHODS[int(0, PAYMENT_METHODS.length - 1)], "method");
      const purpose = chance(0.2) ? "repays_receivable" : "settles_order";
      const amount = int(1, 40) * 500;
      const key = nextAttempt();
      emit(shiftPayment(`O${p}`, amount, { attempt: key, shift_id: shiftId, method, purpose }));
      if (chance(0.25)) {
        // Transport/UI duplicate — same key, IDENTICAL intent: counts once (01-F31).
        emit(shiftPayment(`O${p}`, amount, { attempt: key, shift_id: shiftId, method, purpose }));
        expected[method] = (expected[method] ?? 0) + amount;
      } else if (chance(0.15)) {
        // Divergent member — the key is disputed and contributes ZERO (01-F31).
        emit(
          shiftPayment(`O${p}`, amount + 500, {
            attempt: key,
            shift_id: shiftId,
            method,
            purpose,
          }),
        );
      } else {
        expected[method] = (expected[method] ?? 0) + amount;
      }
    }
    if (chance(0.4)) emit(paidOut(shiftId, int(1, 10) * 1000));
    for (let d = int(0, 2); d > 0; d--) emit(drawerOpened(shiftId));
    // 02-F21 counts `no_sale` and nothing else; the generator carries the other reason too so
    // the discriminator is under the property, not only under the directed tests.
    if (chance(0.4)) emit(drawerOpened(shiftId, NOT_NO_SALE_REASON));
    if (chance(0.3))
      // 02-F37: a settlement with NO shift open. Legal, flagged, never retro-bound.
      emit(shiftPayment("Ox", int(1, 20) * 500, { attempt: nextAttempt(), shift_id: null }));
    if (chance(0.7))
      emit(
        shiftClosed(shiftId, {
          counted_cash_paisa: (expected.cash ?? 0) + int(-5, 5) * 100,
          // `expected` accumulates only the methods this seed actually tendered; the builder
          // completes it to ruling 2's exhaustive map, so a generated close is the same shape as
          // a directed one and the property tests never fold a partial map.
          expected_paisa_by_method: expected,
        }),
      );
    if (chance(0.3))
      // A payment keyed to a shift that is already closed — the 26 §7 carried-key case.
      emit(shiftPayment("Oz", int(1, 10) * 500, { attempt: nextAttempt(), shift_id: shiftId }));
  }
  if (chance(0.5)) emit(depositRecorded("D1", int(1, 30) * 10000));
  if (chance(0.5)) emit(dayClosed("D1", { counted_cash_paisa: int(1, 100) * 10000 }));
  // A payment for a shift whose `shift.opened` is NOT in the set at all — 00 §6 soft refs:
  // tolerated, never dropped, never parked into a projection hole.
  if (chance(0.4)) emit(shiftPayment("Og", 3500, { attempt: nextAttempt(), shift_id: "S-ghost" }));

  return { identity, envelopes };
};
