// T-01-08 quarantine query seam (contract decision 5; 01-F37 "surfaced to fleet
// health"): the doc-15 READ seam only — the fleet-health dashboard, alerting and
// the operator resolution/correction flow are doc 14/15, explicitly out of
// scope. A read-only projection over kernel.quarantine: org_id scopes
// ABSOLUTELY (00 §5.4 — another org reusing the same branch_id string never
// leaks), optional branch/device filters, received_at DESC (newest first),
// page-capped. Listing changes nothing.
//
// This is the LIVE quarantine surface (T-01-21): rows marked `superseded_at` are
// excluded. A superseded row is a placeholder whose event later merged legitimately —
// retained as evidence (review #7, ruled) but not a problem anyone needs to act on,
// so counting it here would show staff a permanent phantom in the "needs attention"
// list. The sort adds `device_id` because the widened key
// (org, claimed_event_id, device_id) makes several rows per claimed id possible, and
// (received_at, claimed_event_id) alone stopped being a total order — an unstable
// sort silently breaks paging by dropping or repeating rows at page boundaries.
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

// @unreached-owed The quarantine READ surface with no reader. `services/api` (tRPC) and the
// manager console (`specs/05`) are both stubs, so nothing exposes it — a device's rejected events
// are recorded correctly and no human can see them. Owed with the first admin surface.
export const listQuarantine = async (
  db: GatewayDb,
  filter: QuarantineFilter,
): Promise<QuarantineEntry[]> => {
  const limit = Math.min(filter.limit ?? QUARANTINE_PAGE_SIZE, QUARANTINE_PAGE_SIZE);
  const rows = await db.execute(
    sql`select claimed_event_id, device_id, reason, received_at, envelope
        from kernel.quarantine
        where org_id = ${filter.org_id}
          and superseded_at is null
        ${filter.branch_id === undefined ? sql`` : sql`and branch_id = ${filter.branch_id}`}
        ${filter.device_id === undefined ? sql`` : sql`and device_id = ${filter.device_id}`}
        order by received_at desc, claimed_event_id desc, device_id desc
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
