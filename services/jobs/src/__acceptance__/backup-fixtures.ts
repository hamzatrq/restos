/**
 * **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2 / `20 §4.3` separation rule) — fixture
 * construction for `tenant-backup-restore.test.ts` (`R38`, `22-F2`/`22-F8`/`22-F16`/`22-F22`,
 * `01-F1`, `01-F71`, `28-F1`).
 *
 * ── WHY THE SEEDS COVER FIFTEEN TABLES AND NOT ONE ───────────────────────────────────────────
 *
 * R38 says *per-tenant backup*, and `28-F1` says **a tenant is an org** — *"`org_id` is the tenancy
 * key on both planes — the same key the envelope, the device registry, the catalog and every one of
 * `01-F71`'s enforcement points already share"*. So the unit under test is *everything in this
 * deployment keyed by one `org_id`*, and a backup that carries `kernel.events` alone would restore
 * a restaurant with a ledger, no menu, no branches, no staff and no devices — an org that cannot be
 * served and whose owner cannot log in.
 *
 * `helpers.ts`'s `orgSnapshot` reads the table list **from `information_schema`** rather than from a
 * hand-copied array, so the equality assertions in `§D` widen automatically the day a table is
 * added. That property is only worth anything if the FIXTURE also populates broadly: an assertion
 * over fifteen tables of which fourteen are empty is an assertion about one table wearing a bigger
 * number. Hence the seeds below touch every kernel table that carries an `org_id`, measured
 * 2026-08-20 against `services/sync-gateway/src/schema.ts`:
 *
 *   events · org_sequences · device_watermarks · quarantine · device_registry · catalog_versions ·
 *   catalog_entries · org_events · quarantine_notices · orgs · branches · users ·
 *   user_credentials · staff_versions · staff_entries · config_versions · config_entries
 *   (the last two joined at `0013`, `01-F87`)
 *
 * ⚠ **The fixture takes the tenant as an ARGUMENT and every tenant is fully populated.** That is
 * `01-F71`'s own lesson from the reference-serve round, quoted in the FR: *"every fixture in the
 * repo passed the session's own key, so a fixture that cannot express a foreign key cannot test a
 * refusal of one."* A backup suite with one populated tenant cannot tell a per-tenant backup from a
 * cluster dump — both restore correctly, and only the second one hands every restaurant a copy of
 * every other restaurant's ledger.
 *
 * ── WHAT IS DELIBERATELY NOT SEEDED ──────────────────────────────────────────────────────────
 *
 * Nothing that would make an org **dirty to the Auditor**: no settled order without tender
 * (`conservation`), no lamport hole, no registry-unknown envelope. Two `services/jobs` workers run
 * against one Postgres while this suite and `auditor-host.test.ts` execute, each auditing every org
 * it can see, and a fixture that manufactures findings for a neighbouring suite to trip over is the
 * shape `oracle-round-2-findings.md` §C keeps recording. The lamport runs here are contiguous and
 * fully acked, and no order is settled.
 */
import { randomUUID } from "node:crypto";
import { newId } from "@restos/domain";
import { BASE_T, envelope, type Identity, insertEvent, type Sql } from "./helpers.js";

/**
 * One token per RUN, mixed into every id and every human string. Two purposes, both measured
 * hazards in this repo: a stale row from a previous run cannot be mistaken for this run's evidence,
 * and the byte-level "does A's artifact contain B?" sweep in `§B` cannot be satisfied by a word
 * that happens to occur in someone else's fixture.
 */
export const RUN = randomUUID().slice(0, 8);

export type Tenant = {
  readonly org_id: string;
  readonly display_name: string;
  readonly branch_ids: readonly [string, string];
  readonly device_ids: readonly [string, string];
  readonly user_ids: readonly [string, string];
  readonly emails: readonly [string, string];
  /** The item name on this tenant's menu. Appears in NO other tenant's rows — `§B` asserts that. */
  readonly item_name: string;
  readonly item_id: string;
  readonly price_paisa: number;
  /** The identity every seeded event is stamped with. */
  readonly identity: Identity;
};

/**
 * `prefix` fixes the SORT ORDER of this suite's orgs, because a host that backs up "the first org
 * discovery returns" must be caught by an assertion rather than by luck — the same reason
 * `helpers.ts`'s `identityFor` takes one.
 */
export const tenantOf = (
  prefix: string,
  display_name: string,
  item_name: string,
  price_paisa: number,
): Tenant => {
  const slug = `${prefix}-${RUN}`;
  const org_id = `org-${slug}-${randomUUID()}`;
  const branch_ids = [`branch-${slug}-1`, `branch-${slug}-2`] as const;
  const device_ids = [`device-${slug}-till`, `device-${slug}-kds`] as const;
  return {
    org_id,
    display_name: `${display_name} ${RUN}`,
    branch_ids,
    device_ids,
    user_ids: [`user-${slug}-owner`, `user-${slug}-cashier`],
    emails: [`owner@${slug}.test`, `cashier@${slug}.test`],
    item_name: `${item_name} ${RUN}`,
    item_id: `item-${slug}-signature`,
    price_paisa,
    identity: { org_id, branch_id: branch_ids[0], device_id: device_ids[0] },
  };
};

/**
 * Strings that appear in exactly ONE tenant's rows. `§B` proves the disjointness before using it,
 * and then asserts that tenant A's backup artifact contains none of tenant B's.
 */
export const markersOf = (t: Tenant): readonly string[] => [
  t.org_id,
  t.display_name,
  t.item_name,
  t.item_id,
  t.branch_ids[0],
  t.device_ids[0],
  t.user_ids[0],
  t.emails[0],
];

/** A fake Argon2id-shaped string. It is a FIXTURE and never a credential — see `11-F21`. */
const pinHashOf = (t: Tenant, user_id: string): string =>
  `$argon2id$v=19$m=65536,t=3,p=4$${RUN}$fixture-not-a-real-hash-${user_id}-${t.org_id.slice(-8)}`;

/**
 * The four events every populated tenant gets: two orders, each with a line. **Deliberately never
 * settled** — a settled order with nothing tendered is `01-F30`'s conservation break and would give
 * the Auditor something to shout about in a suite that is not about the Auditor.
 */
const eventsOf = (t: Tenant): ReturnType<typeof envelope>[] => {
  const orderA = `order-${t.org_id.slice(-8)}-1`;
  const orderB = `order-${t.org_id.slice(-8)}-2`;
  return [
    envelope(t.identity, 0, { payload: { order_id: orderA, channel: "counter" } }),
    envelope(t.identity, 1, {
      type: "order.line_added",
      payload: {
        order_id: orderA,
        line_id: `line-${newId()}`,
        item_id: t.item_id,
        qty: 1,
        unit_price_paisa: t.price_paisa,
      },
    }),
    envelope(t.identity, 2, { payload: { order_id: orderB, channel: "foodpanda" } }),
    envelope(t.identity, 3, {
      type: "order.line_added",
      payload: {
        order_id: orderB,
        line_id: `line-${newId()}`,
        item_id: t.item_id,
        qty: 2,
        unit_price_paisa: t.price_paisa,
      },
    }),
  ];
};

/** Every kernel table that carries an `org_id`, populated for one tenant. */
export const seedTenant = async (sql: Sql, t: Tenant): Promise<void> => {
  await sql`
    insert into kernel.orgs (org_id, display_name, status, created_at)
    values (${t.org_id}, ${t.display_name}, 'active', ${BASE_T})`;

  for (const [index, branch_id] of t.branch_ids.entries()) {
    await sql`
      insert into kernel.branches
        (branch_id, org_id, display_name, branch_type, branch_class, created_at)
      values (${branch_id}, ${t.org_id}, ${`${t.display_name} #${String(index + 1)}`},
              ${index === 0 ? "branch" : "prep_kitchen"}, 'production', ${BASE_T})`;
  }

  for (const [index, user_id] of t.user_ids.entries()) {
    await sql`
      insert into kernel.users
        (user_id, org_id, email, display_name, password_hash, assignments, grid_ordinal, created_at)
      values (${user_id}, ${t.org_id}, ${t.emails[index] ?? null},
              ${`${t.display_name} person ${String(index + 1)}`},
              ${pinHashOf(t, user_id)},
              ${sql.json(
                index === 0
                  ? [{ role: "owner", branch_id: null }]
                  : [{ role: "cashier", branch_id: t.branch_ids[0] }],
              )},
              ${index}, ${BASE_T})`;
    await sql`
      insert into kernel.user_credentials (org_id, user_id, pin_hash, updated_at)
      values (${t.org_id}, ${user_id}, ${pinHashOf(t, user_id)}, ${BASE_T})`;
  }

  await sql`
    insert into kernel.staff_versions (org_id, branch_id, version, published_at, actor_user_id)
    values (${t.org_id}, ${t.branch_ids[0]}, 1, ${BASE_T}, ${t.user_ids[0]})`;
  for (const [index, user_id] of t.user_ids.entries()) {
    await sql`
      insert into kernel.staff_entries
        (org_id, branch_id, version, user_id, display_name, grid_ordinal, status, assignments,
         pin_hash)
      values (${t.org_id}, ${t.branch_ids[0]}, 1, ${user_id},
              ${`${t.display_name} person ${String(index + 1)}`}, ${index}, 'active',
              ${sql.json([{ role: index === 0 ? "owner" : "cashier", branch_id: null }])},
              ${pinHashOf(t, user_id)})`;
  }

  for (const version of [1, 2]) {
    await sql`
      insert into kernel.catalog_versions (org_id, version, published_at, actor_user_id)
      values (${t.org_id}, ${version}, ${BASE_T + version}, ${t.user_ids[0]})`;
  }
  const prices = t.branch_ids.flatMap((branch_id) =>
    ["counter", "foodpanda"].map((channel) => ({ branch_id, channel, price_paisa: t.price_paisa })),
  );
  await sql`
    insert into kernel.catalog_entries
      (org_id, version, kind, entry_id, name, kitchen_name, parent_id, sort, deleted, prices)
    values (${t.org_id}, 1, 'category', ${`${t.item_id}-cat`}, ${`${t.display_name} mains`},
            null, null, 1, 0, null)`;
  await sql`
    insert into kernel.catalog_entries
      (org_id, version, kind, entry_id, name, kitchen_name, parent_id, sort, deleted, prices)
    values (${t.org_id}, 1, 'item', ${t.item_id}, ${t.item_name}, ${t.item_name},
            ${`${t.item_id}-cat`}, 1, 0, ${sql.json(prices)})`;
  await sql`
    insert into kernel.catalog_entries
      (org_id, version, kind, entry_id, name, kitchen_name, parent_id, sort, deleted, prices)
    values (${t.org_id}, 2, 'item', ${t.item_id}, ${t.item_name}, ${t.item_name},
            ${`${t.item_id}-cat`}, 1, 0, ${sql.json(prices)})`;

  for (const [index, device_id] of t.device_ids.entries()) {
    await sql`
      insert into kernel.device_registry
        (org_id, branch_id, device_id, device_class, display_name, revoked_at, token_expires_at)
      values (${t.org_id}, ${t.branch_ids[0]}, ${device_id},
              ${index === 0 ? "counter" : "kds"},
              ${`${t.display_name} ${index === 0 ? "till" : "screen"}`}, null,
              ${BASE_T + 90 * 24 * 60 * 60 * 1000})`;
  }

  const events = eventsOf(t);
  for (const [index, event] of events.entries()) await insertEvent(sql, event, index);
  await sql`
    insert into kernel.device_watermarks (org_id, device_id, acked_watermark)
    values (${t.org_id}, ${t.identity.device_id}, ${events.length - 1})`;
  await sql`
    insert into kernel.org_sequences (org_id, next_global_seq) values (${t.org_id}, ${events.length})`;

  /**
   * `01-F37`'s quarantine and its notice. Included because they are the one part of a tenant's
   * cloud state that is *evidence about a fault* rather than product data — the part an
   * implementer is most likely to leave out of a backup, and the part `01-F37` says is *"retained
   * verbatim as evidence"*. `envelope` here is `text`, not `jsonb`, on purpose (the schema's own
   * note: bytes jsonb cannot faithfully hold must still be quarantinable).
   */
  const claimed = `evt-claimed-${t.org_id.slice(-8)}`;
  await sql`
    insert into kernel.quarantine
      (id, org_id, branch_id, device_id, claimed_event_id, reason, envelope, received_at,
       superseded_at, envelope_author)
    values (${`q-${t.org_id.slice(-8)}`}, ${t.org_id}, ${t.branch_ids[0]}, ${t.device_ids[1]},
            ${claimed}, 'org_mismatch',
            ${`{"id":"${claimed}","note":"verbatim bytes for ${t.display_name}"}`},
            ${BASE_T + 10}, null, ${t.device_ids[1]})`;
  await sql`
    insert into kernel.quarantine_notices
      (id, org_id, branch_id, device_id, claimed_event_id, reason, created_at, delivered_at)
    values (${`qn-${t.org_id.slice(-8)}`}, ${t.org_id}, ${t.branch_ids[0]}, ${t.device_ids[1]},
            ${claimed}, 'org_mismatch', ${BASE_T + 11}, null)`;

  /**
   * `01-F62`'s org-scoped log. ⚠ **`catalog.changed` was the ONE member of the five with a payload
   * schema in `packages/domain` when this comment was written; `01-F87` (a) gave `config.changed`
   * one, so it is now TWO — and the second is seeded below beside its artifact**, because a
   * restore that carried the ledger record of a rate change without the rate itself would be a
   * tenant whose history says a tax rate moved and whose configuration says it never did.
   */
  for (const version of [1, 2]) {
    await sql`
      insert into kernel.org_events (org_id, type, actor_user_id, server_received_at, payload)
      values (${t.org_id}, 'catalog.changed', ${t.user_ids[0]}, ${BASE_T + version},
              ${sql.json({ version, entry_id: t.item_id, name: t.item_name })})`;
  }

  /**
   * `01-F87`'s layer-2 CONFIGURATION — the org's tax posture, its charge-rounding step and its
   * approval thresholds, as the fourth `01-F75` reference-data resource stores them.
   *
   * ⚠ **THE MOST DAMAGING TABLE ON THIS LIST TO LOSE, AND THE EASIEST TO MISS.** A restore that
   * dropped it leaves the tenant's ledger, menu, roster and quarantine intact while every till in
   * the org silently falls back to `01-F87` (b)'s DECLARED BUILD DEFAULTS — `16-F1`'s no tax at
   * all and `05-F33`'s approve-every-paid-out — with no error anywhere and nothing on any screen
   * that is wrong, because an unconfigured org is a perfectly ordinary org. `tenant-artifact.ts`
   * enumerates `information_schema` rather than a hand-written list precisely so this table is
   * carried the moment it exists; what the fixture owes is a ROW, because §0's own message says an
   * equality assertion over an empty table is an assertion about nothing.
   *
   * The values differ per tenant (the marker is the rate), so a leak between A and B is visible in
   * the artifact rather than only in a row count — which is what §B3 and §D2 rest on.
   */
  const rate_bps = t.org_id.includes("kababjees") ? 1600 : 800;
  await sql`
    insert into kernel.config_versions (org_id, version, published_at, actor_user_id)
    values (${t.org_id}, 1, ${BASE_T + 20}, ${t.user_ids[0]})`;
  await sql`
    insert into kernel.config_entries (org_id, version, key, value, deleted)
    values (${t.org_id}, 1, 'tax.posture_matrix',
            ${sql.json({ default: { posture: "exclusive", rate_bps }, by_tender: [] })}, 0)`;
  await sql`
    insert into kernel.config_entries (org_id, version, key, value, deleted)
    values (${t.org_id}, 1, 'charge.rounding_paisa', ${sql.json(100)}, 0)`;
  await sql`
    insert into kernel.org_events (org_id, type, actor_user_id, server_received_at, payload)
    values (${t.org_id}, 'config.changed', ${t.user_ids[0]}, ${BASE_T + 21},
            ${sql.json({
              key: "tax.posture_matrix",
              layer: 2,
              version: 1,
              before: null,
              after: { default: { posture: "exclusive", rate_bps }, by_tender: [] },
            })})`;
};

/**
 * A tenant that has signed up and not yet traded: **one `kernel.orgs` row and nothing else.**
 *
 * ⚠ **The absent `org_sequences` row is the whole point of this fixture and is deliberate, not an
 * omission.** That table is written by the merge gateway *the first time an org's ledger receives
 * anything*, so a restaurant that has signed up (`28-F12`) and not yet rung a sale has an `orgs`
 * row and no counter — and `services/jobs`'s existing org discovery, `everyOrg`, reads
 * `kernel.org_sequences` precisely because it is *"cheaper than a `distinct` over `kernel.events`"*.
 * Copying that query into a backup pass is the single most plausible implementation and it **loses
 * every tenant that has not traded yet**: the newest restaurant on the deployment, the one whose
 * owner is still typing her menu in, backed up by nothing.
 *
 * `22 §1` makes nothing in doc 22 tier- or size-dependent, and `01-F68` says an org with no events
 * is *"UNNAMED, not invalid"* — it folds, syncs and settles like any other. So the backup's org
 * discovery must be the org DIRECTORY, not the ledger's counter table, and `§B1`/`§B4` are what say
 * so.
 */
export const seedThinTenant = async (sql: Sql, t: Tenant): Promise<void> => {
  await sql`
    insert into kernel.orgs (org_id, display_name, status, created_at)
    values (${t.org_id}, ${t.display_name}, 'active', ${BASE_T})`;
};

/**
 * Every kernel row of one org, gone. This is the suite DESTROYING data so that a restore has
 * something to prove — `01-F1` binds the product, not a fixture that is simulating the loss the
 * whole of doc 22 exists for.
 *
 * The table list is read from `information_schema` for `orgSnapshot`'s reason: a hand-copied list
 * stops covering a table the day one is added, and here that would leave rows behind and make a
 * restore look complete when it was not.
 */
export const destroyTenant = async (sql: Sql, org_id: string): Promise<void> => {
  const tables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.columns
    where table_schema = 'kernel' and column_name = 'org_id'
    order by table_name`;
  for (const { table_name } of tables) {
    await sql.unsafe(`delete from kernel.${table_name} where org_id = $1`, [org_id]);
  }
};

/** One extra event appended AFTER a backup was taken — `§D`'s append-only case. */
export const appendTailEvent = async (
  sql: Sql,
  t: Tenant,
): Promise<ReturnType<typeof envelope>> => {
  const tail = envelope(t.identity, 4, {
    payload: { order_id: `order-${t.org_id.slice(-8)}-tail`, channel: "counter" },
  });
  await insertEvent(sql, tail, 4);
  return tail;
};
