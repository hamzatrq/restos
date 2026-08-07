import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/** The gateway's database handle. Same alias `catalog.ts` uses, kept local for the same reason. */
type Db = PostgresJsDatabase<Record<string, unknown>>;

/**
 * `01-F62` — the ORG-SCOPED half of the `01 §4` catalog (closes `DEC-SYNC-012`).
 *
 * A back-office edit has neither a branch nor a hub, so it has no `EventEnvelope`: `01-F43`..`F46`
 * make `branch_created_at` and `time_basis` branch-consensus values stamped at append by an
 * originating DEVICE. `01-F62` rules shape (c) — an org-scoped event lands in an audit store that
 * is not the branch ledger at all, "never enters a branch stream and no device folds it".
 *
 * That is the whole reason this module exists beside `gateway.ts` rather than inside it: the merge
 * gateway's every write is `(org_id, branch_id, device_id, lamport_seq, global_seq)`, and an
 * org-scoped record has none of those five. Threading a nullable branch through the merge path
 * would have put the two kinds one `if` apart, which is how a fold eventually reads one.
 */

/**
 * `01-F62`'s org-scoped set, verbatim: *"an event type is org-scoped when its only legitimate
 * emitter is the cloud plane: `catalog.changed`, `device.registered / revoked`, `user.changed`,
 * `config.changed`."*
 *
 * **`audit.*` is deliberately absent and that is the FR's own worked example** — `audit.login` is
 * emitted by a DEVICE at a PIN unlock and `01-F5`'s chain is per-device, so the admin *family* does
 * not split cleanly and the EMITTER does. A writer that keyed off the doc that declares a type
 * (14/15 = "admin" = org) would accept `audit.login` here and quietly take it out of the per-device
 * chain `01-F5` requires.
 */
export const ORG_SCOPED_EVENT_TYPES = [
  "catalog.changed",
  "device.registered",
  "device.revoked",
  "user.changed",
  "config.changed",
] as const;

export type OrgScopedEventType = (typeof ORG_SCOPED_EVENT_TYPES)[number];

const ORG_SCOPED = new Set<string>(ORG_SCOPED_EVENT_TYPES);

/**
 * One org-scoped record, as the wire and the table both carry it.
 *
 * The absent fields are the point: no `branch_id`, no `branch_created_at`, no `time_basis`, no
 * `device_id`, no `lamport_seq`, no `global_seq`. `01-F62` rejected alternative (a) — a `server`
 * value on `time_basis` — precisely because it would put a non-branch value in a branch field, and
 * this type is the shape that refusal implies.
 */
export type OrgEvent = {
  readonly org_id: string;
  readonly type: string;
  readonly actor_user_id: string | null;
  /**
   * `01-F18`/`01-F62`'s ordering authority, stamped by the CLOUD plane at append. Legitimate for
   * the reason the FR gives: the cloud is the one place a clock is not a threat — the inverse of
   * the device-clock threat model `01-F43` was written for.
   */
  readonly server_received_at: number;
  readonly payload: unknown;
};

/**
 * Append one org-scoped event. **Refusal happens HERE, at the writer**, on the same reasoning
 * `publishCatalog` records: the read path applying the rules first means a bad row is discovered by
 * whoever tries to render it, and `14-F3`'s history is the only reader there is.
 *
 * Two refusals, both `01-F62`:
 *
 *  1. a type outside the org-scoped set — a branch event stored here would sit outside every
 *     branch stream, invisible to catchup and to fan-out, and `01-F1` forbids moving it later;
 *  2. a record carrying any branch field — the FR's rejected alternative arriving through the
 *     back door. The check is on MEMBERSHIP of the key, not on its truthiness, because a caller
 *     that sent `branch_id: null` has still modelled the event as branch-scoped and is one line
 *     away from sending a real one.
 *
 * The payload body is **not** validated here, and that is a stated limit rather than an oversight:
 * `packages/domain` exports no per-type payload schema (`parseEvent` demands an envelope this event
 * has by definition), so validating would mean re-declaring a schema `18 §2` says lives there once.
 * The blast radius differs from `publishCatalog`'s too — a malformed catalog entry made every
 * device in the org unable to sync, while a malformed history payload is one unreadable row on one
 * back-office screen.
 */
export const appendOrgEvent = async (db: Db, event: OrgEvent): Promise<void> => {
  if (!ORG_SCOPED.has(event.type)) {
    throw new RangeError(
      `appendOrgEvent: "${event.type}" is not an org-scoped event type (01-F62). The org-scoped ` +
        `set is ${ORG_SCOPED_EVENT_TYPES.join(", ")} — everything else is branch-scoped and ` +
        `belongs in kernel.events with its 01-F43 branch stamp, INCLUDING audit.*, which a ` +
        `device emits at a PIN unlock.`,
    );
  }
  const branchField = ["branch_id", "branch_created_at", "time_basis", "device_id"].find(
    (key) => key in (event as Record<string, unknown>),
  );
  if (branchField !== undefined) {
    throw new RangeError(
      `appendOrgEvent: an org-scoped event carries no branch fields (01-F62), and this one ` +
        `carries \`${branchField}\`. 01-F62 rejected exactly this shape — a server value in a ` +
        `branch column makes a branch field carry a non-branch value, and a later fold reads it.`,
    );
  }
  await db.execute(
    sql`insert into kernel.org_events (org_id, type, actor_user_id, server_received_at, payload)
        values (${event.org_id}, ${event.type}, ${event.actor_user_id},
                ${event.server_received_at}, ${JSON.stringify(event.payload)}::jsonb)`,
  );
};

/**
 * An org's org-scoped history, oldest first — `14-F3`'s browsable price history.
 *
 * Ordered by `server_received_at` (`01-F18`, `01-F62`), tiebroken by arrival: a `14-F8` bulk edit
 * writes one record PER ITEM at one instant on purpose, so without the tiebreak the five rows of a
 * five-item edit come back in whatever order the planner felt like and the screen reorders itself
 * between visits. `seq` is a tiebreak and never an authority — nothing folds it and no client is
 * told it exists, which is why it is not on `OrgEvent`.
 */
export const orgEventHistory = async (db: Db, org_id: string): Promise<readonly OrgEvent[]> => {
  const rows = await db.execute(
    sql`select org_id, type, actor_user_id, server_received_at, payload
        from kernel.org_events
        where org_id = ${org_id}
        order by server_received_at asc, seq asc`,
  );
  return [...rows].map((row) => ({
    org_id: String(row.org_id),
    type: String(row.type),
    actor_user_id: row.actor_user_id === null ? null : String(row.actor_user_id),
    server_received_at: Number(row.server_received_at),
    payload: row.payload,
  }));
};
