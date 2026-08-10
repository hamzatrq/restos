/**
 * `DEC-MONEY-009` — **REFUSE THE SECOND SETTLEMENT AT THE TILL.**
 *
 * ── The defect this exists for, measured on a running system (2026-08-10) ────────────────────
 *
 * The first two-till run this product ever had. Both cashiers keyed **Rs 2,240** against a
 * Rs 2,240 order and pressed `TAKE CASH` together: two `payment.recorded` events, 224000 paisa
 * each, two different `settlement_attempt_id`s. Both tills' `shift_cash` fold read **Cash
 * Rs 4,480**, both screens read `DUE Rs 0`, nothing anywhere flagged it, and the shift closed
 * **Rs 2,240 short against a correct drawer** — with both devices agreeing, so no human had a
 * discrepancy to notice, and `01-F1` makes it permanent.
 *
 * **The idempotency algebra is not broken and this is not a fix to it.** `01-F31`'s
 * `settlement_attempt_id` protects double-taps and crash-retries; two cashiers are two GENUINE
 * attempts, so `26 §7`'s unique-keyed sum correctly adds them. `DEC-MONEY-008` guards the
 * opposite failure (a colliding key making cash vanish). Neither was ever aimed at concurrent
 * human settlement.
 *
 * ── THE ONE CONSTRAINT THAT MAKES THE RULING IMPLEMENTABLE ───────────────────────────────────
 *
 * **The refusal is a LOCAL decision against this device's own converged fold. It never reaches
 * the network, never waits on a lock and never consults a peer.** That is not a style
 * preference — it is the whole difference between an implementable ruling and a commandment-4
 * violation:
 *
 *   - A till that asks the cloud whether an order is settled is a till that **stops selling when
 *     the WAN drops**, which is exactly the break `01-F17` and `00 §5.1` forbid and `05-F8`
 *     restates.
 *   - A till that reads **its own converged state** and declines to settle an order it already
 *     knows is settled is refusing a **duplicate**, not blocking a sale.
 *
 * So the only input below is `store.openOrders()` — one synchronous read of the device's own
 * SQLite projection. `__acceptance__/double-settlement.test.ts` §C is what holds that: it drives
 * this module through a dependency Proxy and asserts the set of members ever touched, so a future
 * consult of a peer, an uplink or a clock reddens by name rather than by review.
 *
 * ── WHAT REFUSAL CANNOT CLOSE, stated because the ruling does not make it go away ─────────────
 *
 * **Two tills PARTITIONED from each other have not converged, so neither can know, and both will
 * accept.** The doubling survives in exactly the case where nothing local can see it. This closes
 * the COMMON case (both tills online, which is when two cashiers actually race) and leaves the
 * partition case open **by construction**. No assertion in this repo may claim otherwise.
 * `DEC-MONEY-009`'s own residual column records what is still owed for it: an emitter for
 * `01-F33`'s closing act, a scheduled Auditor, and a decision on `EXCESS_TENDER_IS_EXCEPTION`.
 *
 * ── Why it is NOT built on `order.settlement_closed` ─────────────────────────────────────────
 *
 * `01-F33` makes settlement an ACT and `order.settlement_closed` is that act — but it has **no
 * production emitter anywhere** in this product (`printing.ts` says so in its own comment), so
 * `OpenOrderRow.settled` is `0` on every order this device has ever held. Building the refusal on
 * a column that is constantly zero is the wave's named defect built deliberately: a guard that can
 * never fire, with every gate green. Emitting the act instead would be **defining a closing act**,
 * which `01-F33` makes a founder question and not a session's call.
 *
 * What ships is therefore the same observable fact `printing.ts` uses for `02-F15`'s receipt and
 * `line-advance.ts` uses for `02-F31`'s settlement edge, **at the same call site in `index.ts`**:
 * the order is **tendered for in full**, `pay_total >= billed_effective`. Reusing that reading
 * rather than inventing a third one is the point — three definitions of "settled" firing off one
 * event is the shape `02-F45` names and refuses.
 */

import { billedEffectiveFromJsonLines, type DeviceStore } from "@restos/sync-client";
import { type AppendRequest, AppendRequestSchema, type AppendResult } from "../shared/ipc";
import type { Gateway } from "./gateway";

/** The three money facts a refusal is made of, all read off ONE `open_orders` row. */
export type AlreadySettled = {
  readonly order_id: string;
  /** `01-F30`'s billed total, through the ENGINE's own derivation — never re-summed here. */
  readonly billed_paisa: number;
  /** `01-F31`'s keyed tender sum. Disputed keys contribute zero; repayments are excluded. */
  readonly paid_paisa: number;
};

/**
 * Is this order already tendered for in full, according to **this device's own fold**?
 *
 * Exported as a pure predicate over one projected row so a suite can drive it directly and so the
 * wrapper below cannot drift from what a test asserts (the `K-3` dead-oracle shape: an oracle
 * pinning its own copy of the branch it exists to pin).
 *
 * **Law 1 (`01-F34`) — nothing here reads ordering metadata.** `pay_total` is `26 §7`'s
 * unique-keyed sum over `settlement_attempt_id` and `billedEffectiveFromJsonLines` is a pure
 * function of the projected line cells. Neither depends on delivery order, envelope ids, a device
 * clock or the reading device's state, so two converged devices answer this question identically.
 *
 * **`billed <= 0` is `null`, deliberately, and it is the narrow half of the refusal.** An order
 * with no billable lines has `0 >= 0` and would otherwise read as "already settled" — refusing
 * there would be refusing a sale that has not happened, which is the `01-F17` break this whole
 * design exists to avoid. It also keeps this module clear of the OPEN `TAKE CASH`-on-an-empty-
 * entry defect recorded in this package's guide: a Rs 0 tender against a real bill leaves
 * `pay_total < billed`, so nothing here fires on it and nothing here fixes it either.
 */
export const alreadySettled = (order: {
  readonly order_id: string;
  readonly pay_total: number;
  readonly json_lines: string;
}): AlreadySettled | null => {
  const billed = billedEffectiveFromJsonLines(order.json_lines);
  if (billed <= 0) return null;
  if (order.pay_total < billed) return null;
  return { order_id: order.order_id, billed_paisa: billed, paid_paisa: order.pay_total };
};

/**
 * The refusal, thrown, with the fact attached under a name a caller can test for.
 *
 * ⚠ **NOTHING IN THE SHIPPING PRODUCT READS `already_settled` TODAY, and that is stated rather
 * than left to look designed.** `ipcMain.handle` serializes a thrown error to its MESSAGE and
 * drops attached properties — `Counter.tsx` records exactly that about `authorize.ts`'s
 * `WriteRefusal`, which is why `02-F20` needed a second IPC channel (`escalationFor`) to get its
 * refusal across the bridge at all. So the discriminator cannot reach a renderer, and the cashier
 * learns the same fact the honest way instead: the Pay surface reads the two numbers off its own
 * projection and says so *before* she reaches for the pad.
 *
 * The property is two lines and is kept because the SUITE asserts on it — an assertion on the
 * message alone could not tell "refused for being a duplicate" from any refusal, which is `F60`'s
 * amendment-test defect recorded in AGENTS.md. **A type-guard export was written here and deleted:
 * `pnpm seams:check` correctly called it out as an export no shipping code reaches — the wave's
 * named defect, caught by the rail, inside the fix for a different defect.**
 */
export type SettlementRefusedError = Error & { readonly already_settled: AlreadySettled };

/**
 * `00 §5.7` — the message names what is true and nothing more.
 *
 * **It cannot name WHO settled it or WHERE, and that absence is honest rather than lazy.**
 * `02-F45` puts attribution on the ENVELOPE (`actor_user_id`), and `OpenOrderRow` — the T-01-15
 * pinned 15-key projection — carries the money and not the actor. Reaching around the fold into
 * the raw ledger for a display value would be fold logic reimplemented outside the engine
 * (`26 §8`) and would be delivery-order sensitive, and widening the projection is a `sync-client`
 * cell-shape change on a protected path. So "already settled by Ayesha on Counter 2" is **owed at
 * the fold**, and inventing it here would be commandment 2.
 */
const settlementRefused = (fact: AlreadySettled): SettlementRefusedError => {
  const error = new Error(
    `payment.recorded refused (DEC-MONEY-009): order ${fact.order_id} is already tendered for in ` +
      `full on this device's own converged fold — ${fact.billed_paisa} paisa billed, ` +
      `${fact.paid_paisa} paisa already taken. A second settlement would double the drawer ` +
      `(01-F30). This is a duplicate, not a sale (01-F17).`,
  ) as Error & { already_settled: AlreadySettled };
  error.already_settled = fact;
  return error;
};

/**
 * The three write methods the renderer's channels reach — `authorizeWrites`' own surface, named.
 *
 * ⚠ **Naming it is what puts this factory under `pnpm seams:check` Rule B, and that is a finding
 * about the rail rather than a style preference.** `check-seams.mjs`'s `optionsOf` reads the
 * single options parameter's type annotation and requires it to match `/^([A-Za-z_$][\w$]*)$/` —
 * so a signature Biome has WRAPPED, which leaves a trailing comma after the annotation
 * (`deps: SettlementGuardDeps,`), fails that test and **the whole factory becomes invisible to
 * Rule B**. Measured 2026-08-10: with an optional `uplink` member added and the signature wrapped,
 * `pnpm seams:check` is **exit 0 and CLEAN at 11 optional seams**; collapse the signature to one
 * line and nothing else, and it is **exit 1 at 12**, naming the member. Inlining this return type
 * is what makes the signature short enough to stay on one line at a 100-column width.
 *
 * `SettlementGuardDeps` has no optional members today, so nothing is hidden here — the point is
 * that the next one added would be. **A repo-wide scan found ONE other factory in this shape:
 * `packages/sync-client/src/pin-audit.ts`'s `createPinAuditSink`,** whose options are both
 * required today and which is on a PROTECTED path. Reported, not fixed here — `check-seams.mjs`
 * is a CI rail with its own blast radius and `24 §3b` forbids the drive-by.
 */
export type RendererWrites = Pick<Gateway, "append" | "addLine" | "toggleAvailability">;

export type SettlementGuardDeps = {
  /** The unguarded writes this wraps. Narrowed by name so nothing else can slip past. */
  readonly writes: RendererWrites;
  /**
   * **THE ONLY INPUT, and its narrowness is the commandment-4 guarantee.** One synchronous read
   * of this device's own projection. There is no transport here, no uplink, no mesh session, no
   * clock and no `await` — a WAN that is down changes nothing about what this module can answer.
   */
  readonly store: Pick<DeviceStore, "openOrders">;
};

/**
 * `DEC-MONEY-009`'s refusal, as a wrapper around the writes the renderer reaches.
 *
 * **A wrapper and not a branch inside `createGateway`**, on `authorizeWrites`' precedent directly
 * next door: the trust boundary is drawn once, in `index.ts`, where a reader can see it — and
 * deleting the wrapper is one argument, which is what makes the seam mutable and therefore
 * testable (`__acceptance__/double-settlement.test.ts` §D).
 *
 * **It sits INSIDE `authorizeWrites`**, so commandment 8 still runs first: a session with no
 * `payment.settle` permission is told it may not settle, rather than being told the bill is
 * already paid.
 *
 * **A refusal appends nothing and unwinds nothing** (commandment 1 / `01-F1`). It is a UI act:
 * the ledger is untouched, the first settlement stands, and the cashier is told on the Pay
 * surface (`Counter.tsx`) — which reads the same two numbers off the same projection, so the
 * screen and this guard can never disagree about whether the bill is covered.
 */
export const refuseDoubleSettlement = (deps: SettlementGuardDeps): RendererWrites => ({
  append: (req: unknown): AppendResult => {
    // Re-parsed rather than read raw: `req` is `unknown` from an untrusted renderer. On anything
    // malformed this narrowing simply misses and the real validator downstream throws — fail-open
    // HERE and fail-closed THERE, so a broken payload can never be refused for the wrong reason.
    const parsed = AppendRequestSchema.safeParse(req);
    if (parsed.success) {
      const fact = refusalFor(parsed.data, deps.store);
      if (fact !== null) throw settlementRefused(fact);
    }
    return deps.writes.append(req);
  },
  // Untouched, and written out rather than spread: a member added to `Gateway` later must be a
  // decision here, not something a spread carries through unexamined.
  addLine: (req: unknown): AppendResult => deps.writes.addLine(req),
  toggleAvailability: (req: unknown): AppendResult => deps.writes.toggleAvailability(req),
});

/**
 * The whole decision, as a pure function of a parsed request and one fold read.
 *
 * **`purpose` is checked and it is not belt-and-braces.** `DEC-MONEY-007` makes a khata
 * repayment a `payment.recorded { purpose: repays_receivable }` against an order that may already
 * be tendered for in full by some other method; `pay_total` excludes repayments, so refusing one
 * would break a flow this ruling says nothing about. Only a TENDER (`settles_order`) can be a
 * duplicate tender.
 */
const refusalFor = (
  req: AppendRequest,
  store: Pick<DeviceStore, "openOrders">,
): AlreadySettled | null => {
  if (req.type !== "payment.recorded") return null;
  if (req.payload.purpose !== "settles_order") return null;
  const order_id = req.payload.order_id;
  if (typeof order_id !== "string") return null;
  const row = store.openOrders().find((o) => o.order_id === order_id);
  return row === undefined ? null : alreadySettled(row);
};
