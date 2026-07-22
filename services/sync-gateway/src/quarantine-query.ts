// T-01-08 quarantine query seam (contract decision 5; 01-F37 "surfaced to fleet
// health"): the doc-15 READ seam only — the fleet-health dashboard, alerting and
// the operator resolution/correction flow are doc 14/15, explicitly out of
// scope. A read-only projection over kernel.quarantine: org_id scopes
// ABSOLUTELY (00 §5.4 — another org reusing the same branch_id string never
// leaks), optional branch/device filters, received_at DESC (newest first),
// page-capped. Listing changes nothing.
import { sql } from "drizzle-orm";
import type { GatewayDb } from "./gateway.js";

/** Default page cap; an explicit `limit` can only narrow it. */
export const QUARANTINE_PAGE_SIZE = 500;

export type QuarantineEntry = {
  claimed_event_id: string;
  device_id: string;
  reason: string;
  received_at: number;
  /** The verbatim quarantined envelope, parsed from the text column (01-F37). */
  envelope: Record<string, unknown>;
};

export type QuarantineFilter = {
  org_id: string;
  branch_id?: string;
  device_id?: string;
  limit?: number;
};

export const listQuarantine = async (
  db: GatewayDb,
  filter: QuarantineFilter,
): Promise<QuarantineEntry[]> => {
  const limit = Math.min(filter.limit ?? QUARANTINE_PAGE_SIZE, QUARANTINE_PAGE_SIZE);
  const rows = await db.execute(
    sql`select claimed_event_id, device_id, reason, received_at, envelope
        from kernel.quarantine
        where org_id = ${filter.org_id}
        ${filter.branch_id === undefined ? sql`` : sql`and branch_id = ${filter.branch_id}`}
        ${filter.device_id === undefined ? sql`` : sql`and device_id = ${filter.device_id}`}
        order by received_at desc, claimed_event_id desc
        limit ${limit}`,
  );
  return [...rows].map((row) => ({
    claimed_event_id: String(row.claimed_event_id),
    device_id: String(row.device_id),
    reason: String(row.reason),
    received_at: Number(row.received_at),
    envelope: JSON.parse(String(row.envelope)) as Record<string, unknown>,
  }));
};
