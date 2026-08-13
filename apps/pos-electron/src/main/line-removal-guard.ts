/**
 * `02-F49` — **`02-F8`'s CONFIRM BOUNDARY, ENFORCED AT ORIGINATION.**
 *
 * ── What this exists for ─────────────────────────────────────────────────────────────────────
 *
 * `02-F8` and `01 §4`'s dagger split one act at one line: *"Line removal pre-confirm is
 * `order.line_removed`; post-confirm it must be `void.recorded` with an approver."* Nothing in the
 * product enforced that split, and **nothing in the kernel can**: `01-F4` validates a payload, and
 * whether an order is confirmed is a **fold** fact that no payload carries.
 *
 * Without this, `order.line_removed` is schema-valid at any time. A cashier rings a Rs 450 karahi,
 * confirms it so the KOT prints and the kitchen cooks it, removes the line, and settles a bill that
 * no longer contains it. The event is permanent (`01-F1`), carries no approver, and `01-F30` has
 * **no `removed_value` term** to make the shortfall visible in any reconciliation. That is
 * Appendix A's *"Void after KOT printed → needs Mgr PIN"* row bypassed by an event type — the
 * theft vector the append-only rule exists to make impossible.
 *
 * ── THE ONE CONSTRAINT THAT MAKES IT IMPLEMENTABLE (`DEC-MONEY-009`'s pattern) ────────────────
 *
 * **A LOCAL decision against this device's own converged fold.** It never reaches the network,
 * never waits on a lock, never consults a peer and never reads a clock. A till that asked the
 * cloud whether an order was confirmed would stop selling when the WAN dropped, which is exactly
 * the break `01-F17` and `00 §5.1` forbid; a till that reads its own converged state and declines
 * is refusing a **mis-routed act**, not blocking a sale. So the only input below is one
 * synchronous read of `store.openOrders()`.
 *
 * `02-F8`'s boundary is `order.confirmed`, and the fold already publishes it as
 * `OpenOrderRow.confirmed_at` — the same anchor `03-F25`'s timers and `02-F9`'s inbox read.
 *
 * **Why NOT `kot.printed`.** `02-F9` puts KOT jobs *"after confirm, never before"*, so the confirm
 * IS the boundary; keying on the print fact would let a removal through for exactly as long as a
 * printer was offline (`03-F5`) or absent (`03-F51`'s screen-only station).
 *
 * ── What refusal cannot close, stated because it does not go away ────────────────────────────
 *
 * Two tills PARTITIONED from each other have not converged, so a till that has not yet received
 * the confirm will accept a removal — and the ledger will hold it. Nothing local can see that, and
 * no assertion in this repo may claim otherwise. What this closes is the case that actually
 * happens: one cashier, one till, one order she confirmed herself thirty seconds ago.
 *
 * ── Why the check is INSIDE `createGateway` and not a wrapper ─────────────────────────────────
 *
 * `refuseDoubleSettlement` is a wrapper because `DEC-MONEY-009` guards the RENDERER's write
 * channels and `main`'s own appends must not be caught by it. This is the opposite: `01-F1` makes
 * a post-confirm removal permanent no matter which caller wrote it, and there is no caller in this
 * app for which the act would be legitimate. The gateway is the one place every producer passes
 * through, so the boundary is drawn there — and `__acceptance__/line-correction-seam.test.ts`
 * drives `createGateway` directly, which is what makes the seam mutable and therefore testable.
 */

import type { DeviceStore } from "@restos/sync-client";
import type { AppendRequest } from "../shared/ipc";

/** The two facts a refusal is made of, both read off ONE `open_orders` row. */
export type RemovalAfterConfirm = {
  readonly order_id: string;
  readonly line_id: string;
  /** `01-F43`'s branch stamp on the confirm anchor. Carried so the refusal can name the fact. */
  readonly confirmed_at: number;
};

/**
 * Is this request a removal against an order **this device's own fold** already holds as confirmed?
 *
 * Exported as a pure predicate over a parsed request and one fold read, so a suite can drive it
 * directly and the wrapper below cannot drift from what a test asserts (the `K-3` dead-oracle
 * shape: an oracle pinning its own copy of the branch it exists to pin).
 *
 * **Law 1 (`01-F34`) — nothing here reads ordering metadata.** `confirmed_at` is the fold's
 * set-determined confirm anchor (`26 §7` matrix row 57, argmin over branch stamps with basis
 * precedence), so two converged devices answer this question identically.
 *
 * **An order this device has never seen is NOT confirmed here, and that is deliberate.** The
 * honest answer for a row that is absent is "no local evidence of a confirm", and refusing on
 * absence would refuse every removal on a till that has not yet caught up — an `01-F17` break in
 * the one direction `02-F49` is not about. The append then lands, and the partition case above is
 * the residual this design states rather than hides.
 */
export const removalAfterConfirm = (
  req: AppendRequest,
  store: Pick<DeviceStore, "openOrders">,
): RemovalAfterConfirm | null => {
  if (req.type !== "order.line_removed") return null;
  const order_id = req.payload.order_id;
  const line_id = req.payload.line_id;
  if (typeof order_id !== "string" || typeof line_id !== "string") return null;
  const row = store.openOrders().find((o) => o.order_id === order_id);
  if (row === undefined || row.confirmed_at === null) return null;
  return { order_id, line_id, confirmed_at: row.confirmed_at };
};

/**
 * `00 §5.7` — the message names what is true, and it names the way OUT.
 *
 * **A refusal is never a dead end, and this is the clause an implementation gets wrong.**
 * `02-F49`: the act must still be completable as a `void.recorded` with an approver, through
 * `02-F20`'s local manager-PIN path (`CHANNELS.escalationFor` / `CHANNELS.escalate`,
 * `ManagerApproval`) which already ships. A refusal that merely says no leaves a cook holding a
 * dish nobody can take off the bill, and `27-F5` forbids the control that disappears instead.
 *
 * So the wording carries the words a caller can route on — `void`, `approval` — for the reason
 * `settlement-guard.ts` records: `ipcMain.handle` serializes a thrown error to its MESSAGE and
 * drops attached properties, so a discriminator object cannot reach a renderer. The property is
 * attached anyway because the SUITE asserts on it, and an assertion on the message alone could not
 * tell "refused for being post-confirm" from any refusal.
 */
export type RemovalRefusedError = Error & { readonly removal_after_confirm: RemovalAfterConfirm };

const removalRefused = (fact: RemovalAfterConfirm): RemovalRefusedError => {
  const error = new Error(
    `order.line_removed refused (02-F49): order ${fact.order_id} is already CONFIRMED on this ` +
      `device's own converged fold (branch stamp ${fact.confirmed_at}), so the kitchen has the ` +
      `ticket. 02-F8 makes a removal after confirm a void.recorded with an approver — take this ` +
      `line off through 02-F20's manager approval, which records who authorised it. The sale is ` +
      `not blocked (01-F17); only this route is.`,
  ) as Error & { removal_after_confirm: RemovalAfterConfirm };
  error.removal_after_confirm = fact;
  return error;
};

/**
 * The whole guard: refuse, or return. Called at the top of `createGateway`'s `append`, BEFORE the
 * envelope is built — `01-F1` makes the event permanent the instant it is written, so a guard that
 * raised after the append, or that logged and continued, would be cosmetic.
 */
export const assertRemovableLine = (
  req: AppendRequest,
  store: Pick<DeviceStore, "openOrders">,
): void => {
  const fact = removalAfterConfirm(req, store);
  if (fact !== null) throw removalRefused(fact);
};
