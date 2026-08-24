/**
 * `10-F18`'s variance report on the CLOUD plane — the fold beside `can()`, and the reference-data
 * port it reads.
 *
 * **This service authorizes and folds; the gateway stores and serves.** `18 §4` gives
 * `kernel.events` exactly one writer service and it is `services/sync-gateway`, so this file holds
 * no database handle and must not grow one. The fold lives here rather than there for
 * `summary.ts`'s reason, which is the load-bearing one: **the branch narrowing `stockReportScope`
 * decides is an authorization outcome**, and putting the computation on the other side of it would
 * mean a second service deciding who sees what. `plans/inventory/design.md` §3 recommends the
 * gateway host `packages/inventory` and §9 q1 leaves the choice to whoever builds step 7 — this is
 * that choice, made the way the shipping precedent already resolves it.
 *
 * ⚠ **`unconfiguredInventoryReference` REFUSES EVERY READ; IT IS NOT A MEMORY STUB, AND ON THIS
 * SURFACE THE STUB IS THE MOST DANGEROUS SHAPE IN THE FILE.** AGENTS.md `L8` measured it exactly:
 * *"Rule B asks whether an optional member is supplied, never whether what was supplied is real,
 * and a stub is a supply."* A reference source answering `{ items: [] }` produces a **complete,
 * confident, entirely empty variance report** — no rows, no floor flag, no unexplained usage — for
 * a restaurant that is short Rs 14,200 of chicken. Nothing about that screen says anything is
 * missing, which is the exact failure `00 §5.7` and `10-F29` both exist to prevent, one level up
 * from the blank count box.
 *
 * ⚠ **WHAT IS OWED, NAMED SO IT IS NOT DISCOVERED LATER.** No shipping surface WRITES this
 * reference data and no shipping device EMITS a `stock.count_recorded`. Both are gated on
 * amendment **A1** — the `inventory` member of `01-F75`'s closed resource set — which slice 1's
 * steps 4, 5 and 6 depend on and which this change does not land. So in the product as it stands
 * today this procedure is **hosted, gated and correct, over a source that refuses**. That is a
 * deliberate, scheduled instance of `L8`'s shape rather than an accidental one, and the difference
 * is that it is written here and in the commit rather than left to be measured by a later session.
 */

import type { AuthSubject } from "@restos/domain";
import { stockReportScope } from "@restos/domain";
import type { InventoryEvent, ReferenceData, VarianceReport } from "@restos/inventory";
import { referenceRefusals, sustainedHints, varianceReports } from "@restos/inventory";
import type { SummaryEvent } from "./summary.js";

/**
 * Where an org's inventory reference data comes from (`01-F21`: edited only via the back office,
 * versioned, distributed as reference-data snapshots).
 *
 * A PORT rather than a table for `DayLedger`'s reason: this service owns no kernel storage.
 */
export type InventoryReference = {
  read(org_id: string): Promise<ReferenceData>;
};

export const unconfiguredInventoryReference = (): InventoryReference => ({
  read: () => {
    throw new Error(
      "no inventory reference source is configured on this host, so 10-F18's variance report " +
        "cannot be computed. An empty answer would render a complete, confident report with no " +
        "rows for a location that may be short any amount at all (00 §5.7, 10-F29). What is owed " +
        "is amendment A1 — the `inventory` member of 01-F75's closed resource set — plus the " +
        "back-office editors (slice 1 step 5) that write it.",
    );
  },
});

/**
 * `SummaryEvent` → `InventoryEvent`.
 *
 * The two shapes meet at three fields and that is the whole adapter. `packages/inventory` declares
 * the MINIMUM it reads (`event.ts`), which is what lets a ledger row cross this boundary **without
 * anything fabricating an envelope id or a device clock** — two fields `01-F34` forbids the fold to
 * read, and which a wider adapter would have had to invent a value for.
 */
const asInventoryEvent = (event: SummaryEvent): InventoryEvent => ({
  type: event.type,
  payload: event.payload,
  envelope: { branch_created_at: event.branch_created_at },
});

export type StockReportRequest = {
  readonly subject: AuthSubject;
  readonly location_id: string;
  readonly events: readonly SummaryEvent[];
  readonly refs: ReferenceData;
  /** The window the caller read. Its bounds are the report's own coverage boundary — see below. */
  readonly window: { readonly from_ms: number; readonly to_ms: number };
};

export type StockReport = {
  readonly location_id: string;
  /** Every closed period inside the window, oldest first. `10-F28`. */
  readonly periods: readonly VarianceReport[];
  /** `10-F33` (c) — hints, and ONLY on a sustained same-signed run across those periods. */
  readonly hints: ReturnType<typeof sustainedHints>;
  /**
   * ⚠ **THE WINDOW IS THE COVERAGE BOUNDARY AND THE ANSWER SAYS SO.** A `10-F28` period chain is
   * exact only from its true baseline: each period's opening is the previous one's close. Reading a
   * trailing window means the FIRST period inside it is treated as a baseline, which is honest —
   * `is_baseline` says so and it carries no rows — but it is not the same claim as "this is the
   * chain". A surface that dropped this would present a bounded answer as an unbounded one.
   */
  readonly window: { readonly from_ms: number; readonly to_ms: number };
  /**
   * `10-F31`'s writer-side invariants, evaluated against the reference data this report was
   * computed from. **Reported, never repaired**: a report that fixed an incomplete reference set
   * would be guessing, and R5 forbids exactly the guesses it would have to make.
   */
  readonly reference_refusals: ReturnType<typeof referenceRefusals>;
};

/**
 * **THE NARROWING, AND IT RETURNS A ONE-ELEMENT LIST FOR EVERY PERMITTED SUBJECT — INCLUDING THE
 * OWNER.** A named export so a test can point at it, the router can pass it to the reader, and a
 * mutant can delete it.
 *
 * ⚠ **THIS IS NOT `summaryBranchScope` WITH THE NOUNS CHANGED, AND THE FIRST DRAFT WAS.** That one
 * answers `null` for an `org` reach, because `12-F22`'s roll-up is legitimately about every branch.
 * A variance report is about ONE `10-F1` location, so `null` here would not widen the answer — it
 * would CORRUPT it: `order.*` carries a branch and no location, `10-F3` deducts "at the selling
 * location", and `packages/inventory` filters only `stock.*` by `payload.location_id`. So an owner
 * whose reader returned every branch would have every other branch's SALES counted as this
 * location's consumption, and the report would show a surplus where there is a shortfall.
 *
 * That is the asymmetry mutation found: with the router passing `[input.branch_id]` directly,
 * mutants A2 and A3 killed **0 of 402** — the narrowing was a second lock with nothing to lock,
 * because the request already named the branch and `can()` had already refused anyone who may not
 * ask about it. Making the ROUTER read the answer is what puts the lock on the door.
 *
 * The reach therefore decides **admission**, not width: `org` and `own_branch` both answer
 * `[location_id]`, `none` refuses. `own_shift` cannot occur (`stockReportScope` never returns it —
 * a `10-F28` period is not a shift) and refuses anyway rather than falling through.
 */
export const stockBranchScope = (subject: AuthSubject, location_id: string): readonly string[] => {
  const reach = stockReportScope(subject, { org_id: subject.org_id, branch_id: location_id });
  if (reach === "org" || reach === "own_branch") return [location_id];
  // Fail closed. `can()` has already refused every route that reaches here, so this is the second
  // lock on one door — and the one that survives someone adding a third caller.
  throw new StockScopeRefusal(
    `report.stock_view reaches "${reach}" for this subject, which cannot answer a location's ` +
      `variance report (10-F34). A cashier holds no stock-report reach at all (10-F19).`,
  );
};

export class StockScopeRefusal extends Error {}

/**
 * The fold. `10-F28`'s period chain, `10-F18`'s variance, `10-F33`'s floor and run gate — all of it
 * in `packages/inventory`, none of it here. This function's whole job is to authorize, narrow, and
 * hand the arithmetic exactly the rows it is allowed to see.
 */
export const stockReport = (request: StockReportRequest): StockReport => {
  const branch_ids = stockBranchScope(request.subject, request.location_id);

  // The narrowing applied a SECOND time, to the rows themselves. The reader is asked for the right
  // branches and the answer is checked against the same authorization outcome, because a reader
  // that ignored the filter would leak with a 200 and nothing on this side would know.
  const permitted = request.events.filter((event) => branch_ids.includes(event.branch_id));

  const periods = varianceReports({
    location_id: request.location_id,
    events: permitted.map(asInventoryEvent),
    refs: request.refs,
  });

  // `10-F33` (g) (iv) needs to know which items had wastage LOGGED at all — the rung that presumes
  // unlogged waste before anything else, because published waste runs 4–10% of purchases and the
  // remedy is the waste button rather than the staff.
  const wastageLogged = new Set<string>();
  for (const event of permitted) {
    if (event.type !== "stock.wastage_recorded") continue;
    const item_id = (event.payload as { item_id?: unknown }).item_id;
    if (typeof item_id === "string") wastageLogged.add(item_id);
  }

  return {
    location_id: request.location_id,
    periods,
    hints: sustainedHints(periods, wastageLogged),
    window: request.window,
    reference_refusals: referenceRefusals(request.refs),
  };
};
