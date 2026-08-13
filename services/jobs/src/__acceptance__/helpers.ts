/**
 * **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2 / `20 §4.3`). Fixture construction for
 * `auditor-host.test.ts`: seed one org's kernel rows so that `runAuditor` — which already exists,
 * is already correct and is already tested (`services/sync-gateway/src/auditor.ts`) — has something
 * true to say about it.
 *
 * **Nothing here reimplements a check.** The fixtures are chosen so the EXPECTED finding follows
 * from `auditor.ts`'s own documented legs and from the FRs those legs cite:
 *   - a missing lamport slot under an advanced watermark → `lamport_gap` (`01-F3`/`01-F8`,
 *     `20 §4.2` "per-device lamport sequences gap-free");
 *   - a stored envelope the current registry cannot parse → `unparseable_merged_event`
 *     (`01-F4` merge gate: no such envelope is admissible, so its presence is corruption);
 *   - a settled order whose tendering falls short of billed → `conservation` (`01-F30`/`01-F32`,
 *     `20 §4.2` "money conservation ... per order and per day").
 */
import { randomUUID } from "node:crypto";
import { type EventEnvelopeT, newId, parseEvent } from "@restos/domain";
import postgres from "postgres";
import { DATABASE_URL_ENV } from "./global-setup.js";

export type Sql = ReturnType<typeof postgres>;

export type Identity = { org_id: string; branch_id: string; device_id: string };

/** A fixed instant, so every seeded envelope is deterministic. */
export const BASE_T = 1_752_800_000_000;

export const databaseUrl = (): string => {
  const url = process.env[DATABASE_URL_ENV];
  if (url === undefined || url === "") {
    throw new Error(
      `[jobs] ${DATABASE_URL_ENV} is not set — the vitest globalSetup (Testcontainers) did not ` +
        "run or failed. Docker is an environment prerequisite; this suite never falls back to " +
        "mocks (20 §1 / 18 §12).",
    );
  }
  return url;
};

export const openSql = (): Sql => postgres(databaseUrl(), { max: 2 });

/**
 * Per-test isolation is BY FRESH ORG, never truncation (the gateway suite's rule). The `prefix`
 * fixes the SORT ORDER of the suite's orgs, which §B relies on: a broken org must be found when it
 * is neither the first nor the last row a naive discovery query returns.
 */
export const identityFor = (prefix: string): Identity => ({
  org_id: `${prefix}-${randomUUID()}`,
  branch_id: newId(),
  device_id: newId(),
});

/** A registry-valid envelope (`order.created`, `01 §4`), self-checked through `parseEvent`. */
export const envelope = (
  identity: Identity,
  lamport: number,
  overrides: Record<string, unknown> = {},
): EventEnvelopeT => {
  const built = {
    id: newId(),
    org_id: identity.org_id,
    branch_id: identity.branch_id,
    device_id: identity.device_id,
    actor_user_id: null,
    lamport_seq: lamport,
    device_created_at: BASE_T + lamport,
    branch_created_at: BASE_T + lamport,
    time_basis: "branch",
    server_received_at: null,
    type: "order.created",
    schema_version: 1,
    payload: { order_id: newId(), channel: "counter" },
    refs: [],
    ...overrides,
  } as EventEnvelopeT;
  parseEvent(built);
  return built;
};

/**
 * Wire-shaped but registry-UNKNOWN. `01-F4`'s merge gate admits no such envelope, so a row holding
 * one is corruption or registry drift — `auditor.ts`'s `unparseable_merged_event` leg.
 * Deliberately NOT self-checked: being unparseable is the point.
 */
export const corruptEnvelope = (identity: Identity, lamport: number): EventEnvelopeT =>
  ({ ...envelope(identity, lamport), type: "not.in.catalog" }) as EventEnvelopeT;

/**
 * ⚠ **`sql.json`, never `${JSON.stringify(event)}::jsonb`** — measured, not stylistic. The driver
 * JSON-ENCODES a text parameter it is about to cast, so the cast form lands a jsonb **string
 * scalar** in the column. `runAuditor` then reports *every* seeded event as
 * `unparseable_merged_event`, including the ones the fixture built as valid — so the clean org is
 * not clean, and a correct host fails four assertions for a reason that is nothing to do with it.
 * The first draft of this file had exactly that bug and only running an implementation found it.
 */
const asJson = (event: EventEnvelopeT): Parameters<Sql["json"]>[0] =>
  JSON.parse(JSON.stringify(event));

export const insertEvent = async (
  sql: Sql,
  event: EventEnvelopeT,
  globalSeq: number,
): Promise<void> => {
  await sql`
    insert into kernel.events
      (id, org_id, branch_id, device_id, lamport_seq, global_seq, server_received_at, envelope)
    values (${event.id}, ${event.org_id}, ${event.branch_id}, ${event.device_id},
            ${event.lamport_seq}, ${globalSeq}, ${BASE_T + globalSeq},
            ${sql.json(asJson(event))})`;
};

export const setWatermark = async (sql: Sql, identity: Identity, acked: number): Promise<void> => {
  await sql`
    insert into kernel.device_watermarks (org_id, device_id, acked_watermark)
    values (${identity.org_id}, ${identity.device_id}, ${acked})
    on conflict (org_id, device_id) do update set acked_watermark = ${acked}`;
};

/**
 * The per-org counter row. Seeded beside the events so that org DISCOVERY is not over-constrained:
 * `kernel.events`, `kernel.org_sequences` and `kernel.device_watermarks` all name the org, and this
 * suite takes no position on which one the worker reads.
 */
export const setOrgSequence = async (sql: Sql, orgId: string, next: number): Promise<void> => {
  await sql`
    insert into kernel.org_sequences (org_id, next_global_seq) values (${orgId}, ${next})
    on conflict (org_id) do update set next_global_seq = ${next}`;
};

/** A device with a contiguous, fully-acked lamport run — the Auditor has nothing to say about it. */
export const seedCleanOrg = async (sql: Sql, identity: Identity): Promise<EventEnvelopeT[]> => {
  const events = [0, 1, 2].map((slot) => envelope(identity, slot));
  for (const [index, event] of events.entries()) await insertEvent(sql, event, index);
  await setWatermark(sql, identity, 2);
  await setOrgSequence(sql, identity.org_id, events.length);
  return events;
};

/** Slots 0 and 2 present, watermark 2 — slot 1 is covered by nothing (`01-F3`/`01-F8`). */
export const seedLamportGapOrg = async (sql: Sql, identity: Identity): Promise<void> => {
  await insertEvent(sql, envelope(identity, 0), 0);
  await insertEvent(sql, envelope(identity, 2), 1);
  await setWatermark(sql, identity, 2);
  await setOrgSequence(sql, identity.org_id, 2);
};

/** A merged row the current registry cannot parse — corruption the report must NAME (`01-F4`). */
export const seedCorruptEventOrg = async (sql: Sql, identity: Identity): Promise<void> => {
  await insertEvent(sql, envelope(identity, 0), 0);
  await insertEvent(sql, corruptEnvelope(identity, 1), 1);
  await setWatermark(sql, identity, 1);
  await setOrgSequence(sql, identity.org_id, 2);
};

/**
 * A settled order billed Rs 1,000 with nothing tendered against it — `01-F30`'s conservation
 * equation, short by 100000 paisa. This is the shape `DEC-MONEY-009`'s residual column is about:
 * money that does not balance and that no screen is going to mention.
 */
export const seedConservationOrg = async (sql: Sql, identity: Identity): Promise<string> => {
  const orderId = `order-${newId()}`;
  const events = [
    envelope(identity, 0, {
      type: "order.created",
      payload: { order_id: orderId, channel: "counter" },
    }),
    envelope(identity, 1, {
      type: "order.line_added",
      payload: {
        order_id: orderId,
        line_id: `line-${newId()}`,
        item_id: "item-chai",
        qty: 1,
        unit_price_paisa: 100_000,
      },
    }),
    envelope(identity, 2, { type: "order.settlement_closed", payload: { order_id: orderId } }),
  ];
  for (const [index, event] of events.entries()) await insertEvent(sql, event, index);
  await setWatermark(sql, identity, 2);
  await setOrgSequence(sql, identity.org_id, events.length);
  return orderId;
};

/** Removes one merged row — used to introduce a gap in an org the worker has already audited. */
export const deleteEventAtSlot = async (
  sql: Sql,
  identity: Identity,
  lamport: number,
): Promise<void> => {
  await sql`
    delete from kernel.events
    where org_id = ${identity.org_id} and device_id = ${identity.device_id}
      and lamport_seq = ${lamport}`;
};

/**
 * How many keys the given Redis holds, over a raw RESP `DBSIZE`.
 *
 * `18 §15` rule 1 — "a small utility is written, not installed": `ioredis` is on `18 §14`'s
 * allowlist, but twenty lines of `node:net` is cheaper than a dependency added for one assertion,
 * and this suite must not be the reason a package enters the lockfile.
 */
export const redisKeyCount = async (url: string): Promise<number> => {
  const { hostname, port } = new URL(url);
  const { createConnection } = await import("node:net");
  return new Promise<number>((done, fail) => {
    const socket = createConnection({ host: hostname, port: Number(port || "6379") }, () => {
      socket.write("*1\r\n$6\r\nDBSIZE\r\n");
    });
    socket.setTimeout(10_000, () => {
      socket.destroy();
      fail(new Error(`[jobs] DBSIZE against ${url} timed out`));
    });
    socket.on("data", (chunk: Buffer) => {
      const reply = chunk.toString("utf8").trim();
      socket.end();
      if (!reply.startsWith(":")) {
        fail(new Error(`[jobs] unexpected DBSIZE reply from ${url}: ${reply}`));
        return;
      }
      done(Number(reply.slice(1)));
    });
    socket.on("error", fail);
  });
};

/**
 * An order-independent digest of every `kernel` table that carries an `org_id`, for one org.
 *
 * The table list is READ FROM THE DATABASE rather than hand-copied: a hand-copied list silently
 * stops covering a table the day one is added, which is precisely how a "the Auditor writes
 * nothing" assertion would rot into a decoration (`K-3`'s dead-oracle defect).
 */
export const orgSnapshot = async (sql: Sql, orgId: string): Promise<string> => {
  const tables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.columns
    where table_schema = 'kernel' and column_name = 'org_id'
    order by table_name`;
  const parts: Record<string, string[]> = {};
  for (const { table_name } of tables) {
    const rows = await sql.unsafe(`select * from kernel.${table_name} where org_id = $1`, [orgId]);
    parts[table_name] = rows.map((row) => JSON.stringify(row)).sort();
  }
  return JSON.stringify(parts);
};
