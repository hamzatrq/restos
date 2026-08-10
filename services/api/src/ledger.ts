/**
 * `12-F10`'s source of numbers, as a PORT: one business day of the merged org ledger (`01-F7`).
 *
 * **`services/api` holds no database handle and must not grow one.** `18 §4` — every table owns
 * exactly one writer service, and for `kernel.events` that service is `services/sync-gateway`. The
 * founder ruling behind the catalog path (*the API publishes, the gateway serves*) is the same
 * shape one surface over: **the gateway stores and serves the ledger; this service authorizes and
 * folds it.** That split is why the fold lives in `summary.ts` beside `can()` rather than in the
 * gateway — the branch narrowing `reportScope` decides is an authorization outcome, and putting
 * the computation on the other side of it would mean a second service deciding who sees what.
 *
 * ⚠ **THE FALLBACK REFUSES; IT IS NOT A MEMORY STUB.** `unconfiguredDayLedger` throws on every
 * call. AGENTS.md measured the stub shape as invisible to every rail this repo has — "Rule B asks
 * whether an optional member is *supplied*, never whether what was supplied is *real*, and a stub
 * is a supply" — and here a stub answering `[]` renders **"Rs 0 · 0 orders"** for a restaurant that
 * took two hundred thousand rupees. An owner cannot tell that screen from a bad night, and `00
 * §5.7` exists precisely to stop a surface reporting a smaller number confidently. A refusal
 * renders as an outage, which is what it is.
 */

import type { SummaryEvent } from "./summary.js";

/**
 * What to read. Half-open `[from_ms, to_ms)` on the event's **branch stamp**, so consecutive days
 * tile with no gap and no double count (`01-F46`).
 *
 * **The window is on `branch_created_at`, never on `server_received_at`, and that is a decision
 * with a losing alternative worth stating.** `01-F44` says the derived business stamp "resolves to
 * `server_received_at` when the cloud has seen the event" — and every row in `kernel.events` has
 * one by construction, so read literally that would bucket by CLOUD ARRIVAL. For a branch whose
 * WAN dropped at 19:00 and healed at 03:00 that banks the entire evening into the following
 * business day, which is precisely the error `01-F46` was written to prevent ("a sale rung at
 * 01:30 belongs to the night it was actually served"). Worse, it would put the cloud and the till
 * in permanent disagreement: `packages/sync-client/src/folds/shift-cash.ts` already derives
 * `days.business_date` from the BRANCH stamp, so an owner's summary and the cashier's own
 * reconciliation would name different days for one sale — `03-F40`'s two-interpretations defect,
 * on money.
 *
 * `01-F44` itself leaves this open ("which FR owns the resolver is deliberately unfixed — doc 16
 * declares it when fiscalization lands"), so this is a stated reading rather than a transcription,
 * and it is the reading that keeps ONE definition of a business day in the product. What
 * `server_received_at` is used for instead is `12-F8`'s sync age, below — a claim about the cloud,
 * not about the business.
 */
export type LedgerWindow = {
  readonly org_id: string;
  /**
   * `null` means every branch in the org — an owner's `12-F22` roll-up. A non-empty list is a
   * `reportScope` narrowing and the reader must honour it; an EMPTY list is a caller error, not
   * "no filter", and the reader refuses it rather than widening.
   */
  readonly branch_ids: readonly string[] | null;
  readonly from_ms: number;
  readonly to_ms: number;
};

export type LedgerWindowResult = {
  readonly events: readonly SummaryEvent[];
  /** The row cap was hit: this is a PREFIX of the day and every total folded from it is a floor. */
  readonly truncated: boolean;
  /**
   * `12-F8` — the newest `server_received_at` the cloud holds for this org, so a surface can say
   * "last synced 22 min ago" instead of presenting stale data as live. Null when the org has never
   * delivered an event. It is deliberately org-wide rather than window-scoped: the question is
   * "how fresh is what I am looking at", and a quiet day would otherwise report itself as offline.
   *
   * This is the ONE place `server_received_at` is read, and it never reaches the fold.
   */
  readonly latest_arrival_ms: number | null;
};

export type DayLedger = {
  read(window: LedgerWindow): Promise<LedgerWindowResult>;
};

/**
 * The fallback a host with no ledger configured gets. Every call throws — see the file header for
 * why an empty answer is the dangerous shape here.
 */
export const unconfiguredDayLedger = (): DayLedger => ({
  read: () => {
    throw new Error(
      "no ledger reader is configured on this host, so the nightly summary cannot be computed " +
        "(12-F10). Set SYNC_GATEWAY_URL and SYNC_GATEWAY_TOKEN — an empty answer would render " +
        "Rs 0 for a day that may have taken any amount at all (00 §5.7).",
    );
  },
});
