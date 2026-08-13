/**
 * One business day of the merged org log, read out for `12-F10`'s nightly owner summary.
 *
 * **This service SERVES; it does not interpret.** The founder ruling behind the catalog path (*the
 * API publishes, the gateway serves*) applies unchanged: this file knows how to select rows from
 * `kernel.events` by org, branch and branch stamp, and knows nothing about orders, shifts, money or
 * business days. The fold lives in `services/api/src/summary.ts`, beside the `can()` check that
 * decides how wide the answer may be — putting it here would mean a second service deciding who
 * sees what, and `18 §4` already puts one writer on this table, not one authority.
 *
 * ⚠ **THE WINDOW IS ON `branch_created_at`, INSIDE THE ENVELOPE — NOT ON `server_received_at`.**
 * `01-F46` makes the day a property of the BUSINESS, so a branch whose WAN dropped at 19:00 and
 * healed at 03:00 must still bank its evening to the night it was served. `server_received_at`
 * would bank it to the following day, and would put this answer in permanent disagreement with the
 * till's own `shift-cash` fold, which derives `days.business_date` from the branch stamp. The full
 * reasoning, including why `01-F44` can be read the other way, is in `services/api/src/ledger.ts`.
 *
 * **Cost, stated rather than discovered later.** `events_org_branch_global_seq_idx` cannot serve
 * this predicate — the stamp is a jsonb field, not a column — so a window read is a scan of the
 * org's rows with a jsonb extraction per row. At pilot scale (one branch, a few thousand events a
 * day) that is milliseconds and the simplest thing that is correct. The index that would fix it is
 * an expression index on `(org_id, ((envelope->>'branch_created_at')::bigint))`, and it is
 * deliberately NOT added here: an index is a migration on a PROTECTED schema, `25` owns fold
 * performance, and adding one before a measured problem is the speculative work `24 §3b` forbids.
 * `ROW_CAP` is what stops the unmeasured case from being unbounded.
 */

import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

type Db = PostgresJsDatabase<Record<string, unknown>>;

/**
 * The most rows one window read will return.
 *
 * **A cap with a REPORTED breach, not silent paging.** `00 §5.7`: a summary folded from a prefix
 * of the day is a floor, and an owner has to be told that rather than shown a smaller number
 * confidently. Paging would be a second mechanism whose partial state is invisible in the answer;
 * one cap and one boolean is honest without it. 50 000 events is roughly a day of five busy tills.
 */
export const ROW_CAP = 50_000;

/** Exactly the envelope fields `12-F10`'s fold is allowed to read. See the header. */
export type WindowEvent = {
  readonly id: string;
  readonly type: string;
  readonly branch_id: string;
  readonly branch_created_at: number;
  readonly time_basis: string;
  readonly actor_user_id: string | null;
  readonly payload: unknown;
};

export type DayWindow = {
  readonly org_id: string;
  /**
   * `null` is every branch in the org. An EMPTY array is a caller error and is REFUSED — it is a
   * `reportScope` narrowing that resolved to nothing, and reading it as "no filter" would widen a
   * branch manager's answer into an org roll-up. `01-F60`'s explicit-zero rule, one table over:
   * absence and nothing are different answers.
   */
  readonly branch_ids: readonly string[] | null;
  /** Inclusive. */
  readonly from_ms: number;
  /** Exclusive, so consecutive business days tile with no gap and no double count (`01-F46`). */
  readonly to_ms: number;
};

export type DayWindowResult = {
  readonly events: readonly WindowEvent[];
  readonly truncated: boolean;
  /** `12-F8` — the newest arrival for this ORG, so a surface can state its own freshness. */
  readonly latest_arrival_ms: number | null;
};

/**
 * Read one window. Rows come back ordered by `global_seq`, and that order carries **no meaning to
 * the caller**: the fold is a function of the delivered SET (`01-F34`) and the ordering exists only
 * so the `ROW_CAP` prefix is a stable one across two identical requests rather than whatever the
 * planner chose that minute. A caller that read anything into row order would be breaking law 1 —
 * which is why `global_seq` itself is not projected.
 */
export const readDayWindow = async (db: Db, window: DayWindow): Promise<DayWindowResult> => {
  if (window.branch_ids !== null && window.branch_ids.length === 0) {
    throw new RangeError(
      "day window: branch_ids is an empty list, which is a scope that reaches no branch. Send " +
        "null for every branch in the org, or a non-empty list (12-F2).",
    );
  }

  const stamp = sql`((envelope->>'branch_created_at')::bigint)`;
  const branchFilter =
    window.branch_ids === null
      ? sql``
      : sql` and branch_id in ${sql`(${sql.join(
          window.branch_ids.map((id) => sql`${id}`),
          sql`, `,
        )})`}`;

  const rows = await db.execute(
    sql`select id, branch_id, envelope
        from kernel.events
        where org_id = ${window.org_id}
          and ${stamp} >= ${window.from_ms}
          and ${stamp} < ${window.to_ms}${branchFilter}
        order by global_seq asc
        limit ${ROW_CAP + 1}`,
  );

  const all = [...rows];
  const truncated = all.length > ROW_CAP;
  const events = all.slice(0, ROW_CAP).map((row): WindowEvent => {
    // `envelope` is stored verbatim as received (`schema.ts`), so the branch stamp and the basis
    // marker are read out of it rather than off a column — there are no columns for them, by
    // design, and inventing some would be a second source for a fact `01-F1` freezes.
    const envelope = row.envelope as Record<string, unknown>;
    return {
      id: String(row.id),
      type: String(envelope.type),
      branch_id: String(row.branch_id),
      branch_created_at: Number(envelope.branch_created_at),
      time_basis: String(envelope.time_basis),
      actor_user_id: typeof envelope.actor_user_id === "string" ? envelope.actor_user_id : null,
      payload: envelope.payload,
    };
  });

  // Deliberately NOT restricted to the window: `12-F8` asks how fresh the org's data is, and a
  // quiet day would otherwise report itself as an offline branch.
  const latest = await db.execute(
    sql`select max(server_received_at) as latest
        from kernel.events
        where org_id = ${window.org_id}`,
  );
  const raw = [...latest][0]?.latest;
  const latest_arrival_ms = raw === null || raw === undefined ? null : Number(raw);

  return { events, truncated, latest_arrival_ms };
};
