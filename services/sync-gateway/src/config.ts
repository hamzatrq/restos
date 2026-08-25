import {
  type ConfigEntry,
  isConfigKey,
  isDeviceConfigKey,
  refuseConfigWrite,
} from "@restos/domain/config";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/** The gateway's database handle. Same alias `catalog.ts` uses; kept local so this module does
 *  not import the gateway and create a cycle. */
type Db = PostgresJsDatabase<Record<string, unknown>>;

/**
 * `01-F87` — the SERVER side of the `config` transport: `catalog.ts` one resource over.
 *
 * `01-F52` says the catalog is reference data and not ledger; `01-F87` says the same of
 * configuration and adds a second rule the catalog does not have — **no fold reads it, for any
 * key**. So nothing here writes an event and nothing here is folded. The `config.changed` LEDGER
 * record is the other half of the plane and belongs to the API (`org-events.ts`, `01-F62`): this
 * file publishes and serves the VALUE, exactly as `catalog.ts` publishes and serves the menu while
 * `catalog.changed` plays no part in delivery.
 *
 * The division of labour is the founder's §6 Q1 ruling, unchanged: **the API publishes, the
 * gateway serves.**
 *
 * ⚠ **THE ONE PLACE THIS FILE INTERPRETS ITS PAYLOAD IS THE WRITER'S REFUSAL, AND THAT IS
 * REQUIRED RATHER THAN A LIBERTY.** `catalog.ts` records why validation lives at the writer: a
 * bad row stored here makes every `reference_response` for the org unparseable and puts the whole
 * fleet in a reconnect loop. `01-F87` (b) is sharper still — a malformed known key refuses the
 * org's WHOLE artifact at every till, which is `16-F1`'s tax silently off and `05-F33`'s
 * approve-every-paid-out, simultaneously and until someone notices. `14-F48` puts the check at the
 * writer for `01-F60`'s stated reason (*"a typo is caught once at a failed save instead of frozen
 * forever in an append-only ledger"*), and `refuseConfigWrite` is its ONE declaration — imported,
 * never re-implemented here, because `14-F48`'s own closing note measures what a second,
 * silently-disagreeing copy costs: **0 of 95 tests.**
 */

export type ConfigPage = {
  form: "snapshot" | "delta";
  version: number;
  base_version?: number;
  entries: ConfigEntry[];
  complete: boolean;
  next_from: number;
};

/**
 * Rows per config frame.
 *
 * Small like the catalog's, and for a different reason: this artifact is *"a handful of scalars
 * and two small tables"* (`01-F87`), so it will not page in practice. The limit is here anyway
 * because `01-F75` makes paging part of the frame vocabulary for EVERY resource — a serve path
 * that assumed one page would be the per-resource carve-out that FR closed its resource set to
 * prevent, and it would fail the first time a module doc adds a key set big enough to split.
 */
export const CONFIG_PAGE_SIZE = 200;

const toNumber = (v: unknown): number => Number(v);

const rowToEntry = (row: Record<string, unknown>): ConfigEntry =>
  toNumber(row.deleted) === 1
    ? { key: String(row.key), deleted: true }
    : { key: String(row.key), value: row.value };

/** The org's current authoritative version. `0` means nothing has ever been published. */
export const configVersion = async (db: Db, org_id: string): Promise<number> => {
  const rows = await db.execute(
    sql`select coalesce(max(version), 0) as v from kernel.config_versions where org_id = ${org_id}`,
  );
  return toNumber([...rows][0]?.v ?? 0);
};

/**
 * Publish a set of layer-2 changes as the next version. Called by the back office through
 * `services/api` (`14-F43`..`14-F48`), never by a device — `01-F87` makes a configuration edit a
 * cloud-plane act and this is its one write path.
 *
 * **THE TRANSACTION is the atomicity story, not the statement order** — `publishCatalog`'s
 * recorded correction, which applies here unchanged: a reader either sees nothing of version N or
 * sees all of it, because both writes commit together. The entries-then-version order is kept
 * because it is the order that stays correct if this is ever split, not because it is doing the
 * work today.
 *
 * **No `effective_at`, deliberately.** `01-F87`: `§9.5` (R31, `14-F36`) puts application time on
 * the ACT, staged above the publisher, so a change the owner schedules for 18:00 publishes at 18:00
 * and the `server_received_at` on its `config.changed` **is** its effective date. A second field
 * here would be a second answer to one question. ⚠ That is a READING of `16-F29` and `01-F87` says
 * so; if doc 16 means a statutory date distinct from the moment of publication, the amendment is
 * owed to `01-F87` and lands here with it.
 */
export const publishConfig = async (
  db: Db,
  org_id: string,
  entries: readonly ConfigEntry[],
  opts: { actor_user_id?: string | null; now: number },
): Promise<number> => {
  if (entries.length === 0) {
    throw new RangeError("publishConfig: an empty change set is not a version (01-F87)");
  }

  /**
   * `14-F48` — **the refusals, at the writer, before anything is stored.**
   *
   * The message names the offending KEY and CELL because `14-F48` requires every refusal to name
   * the offending row or cell in the owner's terms, and because `01-F87` (b)'s blast radius makes
   * *"one of your settings is bad"* an answer nobody can act on.
   *
   * A DUPLICATE key inside one publish is refused here rather than resolved: two rows for one key
   * let ARRAY POSITION decide a tax rate, which is `01-F34`'s hazard arriving through a settings
   * screen — the same rule `01-F75` states as *"unique within the artifact"* and the wire schema
   * enforces per frame.
   */
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    if (seen.has(entry.key)) {
      throw new RangeError(
        `publishConfig: entry ${index} repeats the key \`${entry.key}\` (01-F75: unique within ` +
          `the artifact). Two rows for one setting let array position decide the value.`,
      );
    }
    seen.add(entry.key);
    // A RESET carries no value and is refused only for an unknown key — resetting a key this
    // build does not declare would store a mark nothing can ever clear.
    if (entry.deleted === true) {
      if (!isConfigKey(entry.key)) {
        throw new RangeError(
          `publishConfig: entry ${index} resets \`${entry.key}\`, which is not a setting this ` +
            `build declares (01-F87 (a), 14-F48).`,
        );
      }
      return;
    }
    const refusal = refuseConfigWrite(entry.key, entry.value);
    if (refusal !== null) {
      throw new RangeError(
        `publishConfig: entry ${index} is not savable — ${refusal.message}. Storing it would ` +
          `refuse this org's WHOLE configuration at every till (01-F87 (b), 01-F56).`,
      );
    }
  });

  return db.transaction(async (tx: Db) => {
    // Serialized per org, on `publishCatalog`'s reasoning verbatim: two concurrent publishes must
    // not both claim version N and leave two different configurations at one number, which is the
    // divergence `01-F56` detects on the DEVICE and the server is where to prevent. An ADVISORY
    // lock because `FOR UPDATE` is illegal with an aggregate and locking the current max ROW would
    // lock nothing on an org's FIRST publish — exactly when two concurrent publishes would both
    // compute version 1. The (org_id, version) primary key is still the real guarantee.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('restos:config:' || ${org_id}))`);
    const current = await tx.execute(
      sql`select coalesce(max(version), 0) as v from kernel.config_versions
          where org_id = ${org_id}`,
    );
    const version = toNumber([...current][0]?.v ?? 0) + 1;
    for (const entry of entries) {
      await tx.execute(
        sql`insert into kernel.config_entries (org_id, version, key, value, deleted)
            values (${org_id}, ${version}, ${entry.key},
                    ${entry.deleted === true ? null : JSON.stringify(entry.value ?? null)}::jsonb,
                    ${entry.deleted === true ? 1 : 0})`,
      );
    }
    // LAST, deliberately — see the note above.
    await tx.execute(
      sql`insert into kernel.config_versions (org_id, version, published_at, actor_user_id)
          values (${org_id}, ${version}, ${opts.now}, ${opts.actor_user_id ?? null})`,
    );
    return version;
  });
};

/**
 * Answer a device's `reference_request` for the `config` artifact (`01-F75`).
 *
 * `catalogPage`'s body with two differences, both of them `01-F87`'s:
 *
 *   1. **The rows a DEVICE may see are filtered by audience.** `02 §Layer 2` says of R60's
 *      commission rate, in terms, *"cloud-plane reporting only, **never sent to the till** and
 *      never a term in any drawer figure"*, and `02-F60` (iii) is why — commission is not inside
 *      `billed_total`, not a term in `01-F30`'s conservation and not a deduction from `02-F23`'s
 *      expected cash, so nothing on a till has any use for it. The VERSION still counts the whole
 *      artifact, which costs a connected till one wasted fetch after a commission-only edit and
 *      buys the property `01-F87` chose a version number FOR: *knowing you hold all of it.*
 *   2. **No signature.** `01-F81` (d) requires one for `device_roster` because that artifact
 *      decides LAN admission; this one carries no credential, and `01-F87` says so in terms.
 */
export const configPage = async (
  db: Db,
  org_id: string,
  have_version: number,
  from: number,
  at_version?: number,
): Promise<ConfigPage> => {
  const current = await configVersion(db, org_id);
  /**
   * `01-F75` — **`at_version` IS A CONTINUATION, NEVER A SELECTOR**, and the three rules are
   * `catalogPage`'s verbatim rather than re-derived: honoured only on a continuation (`from > 0`);
   * `> 0` because `0` means *the org has published nothing* on this wire and a populated key
   * answering `version: 0` would hand the device an empty snapshot its own monotonic apply cannot
   * detect as wrong; `<= current` because a device must never be handed a version from the future,
   * which after a restore (`22`) the org can legitimately be behind.
   */
  const version =
    from > 0 && at_version !== undefined && at_version > 0 && at_version <= current
      ? at_version
      : current;
  if (version === 0) {
    // Nothing published. An honest empty snapshot rather than a refusal — and on THIS artifact the
    // outcome is specified rather than merely tolerable: `01-F87` (b) says a device that has never
    // received the artifact uses the declared defaults and never blocks (`01-F17`, `00 §5.1`).
    return { form: "snapshot", version: 0, entries: [], complete: true, next_from: 0 };
  }

  // Can a delta be built from EXACTLY this base? Only if that version was published and the device
  // is genuinely behind. A device claiming a version we never published gets a snapshot, which is
  // also what happens to a device from the future after a restore.
  const known =
    have_version > 0 &&
    have_version <= version &&
    [
      ...(await db.execute(
        sql`select 1 from kernel.config_versions
            where org_id = ${org_id} and version = ${have_version}`,
      )),
    ].length > 0;

  if (known && have_version === version) {
    return {
      form: "delta",
      version,
      base_version: have_version,
      entries: [],
      complete: true,
      next_from: 0,
    };
  }

  // ONE entry per changed key, the greatest version <= the target — the same fold a snapshot at
  // that version is, restricted to the keys that changed. `01-F75`'s rule, and `catalogPage`
  // records what the other shape costs: replaying every published row hands the device a
  // publication log rather than the state it asked for.
  const rows = known
    ? await db.execute(
        sql`select key, value, deleted from (
              select distinct on (key) key, value, deleted
              from kernel.config_entries
              where org_id = ${org_id} and version > ${have_version} and version <= ${version}
              order by key asc, version desc
            ) folded
            order by key asc
            offset ${from} limit ${CONFIG_PAGE_SIZE + 1}`,
      )
    : await db.execute(
        sql`select key, value, deleted from (
              select distinct on (key) key, value, deleted
              from kernel.config_entries
              where org_id = ${org_id} and version <= ${version}
              order by key asc, version desc
            ) folded
            order by key asc
            offset ${from} limit ${CONFIG_PAGE_SIZE + 1}`,
      );

  /**
   * ⚠ **THE FILTER RUNS BEFORE PAGING, WHICH IS WHY IT IS HERE AND NOT IN THE SQL.**
   *
   * A `cloud_only` row removed after the `offset`/`limit` would make a page shorter than the
   * cursor arithmetic assumes, so `next_from` would skip rows on the following page — a partial
   * artifact committed at a full version number, which is `01-F56`'s undetectable divergence
   * arriving through a pagination bug. Filtering in SQL would mean this service knowing the key
   * registry, which is `@restos/domain`'s (`18 §2`/`18 §4`) and would be a second declaration of
   * it.
   *
   * ⚠ **An UNKNOWN key passes this filter and reaches the device on purpose.** `isDeviceConfigKey`
   * is false for a key this build does not declare, so filtering on it alone would silently drop a
   * key a NEWER writer stored — and `01-F87` (b) gives the device the disposition for that case
   * (ignore it, the cloud is newer), which it cannot exercise for bytes it never receives. The
   * predicate is therefore *"withhold only what is KNOWN and cloud-only"*.
   *
   * Its cost is stated rather than hidden: because the filter is applied after the page is cut,
   * a page can come back shorter than `CONFIG_PAGE_SIZE`. That is correct — `complete` and
   * `next_from` are computed from the FETCHED rows below, which is the cursor the device echoes.
   */
  const fetched = [...rows];
  const page = fetched.slice(0, CONFIG_PAGE_SIZE);
  const complete = fetched.length <= CONFIG_PAGE_SIZE;
  const entries = page.map(rowToEntry).filter((entry) => !isCloudOnly(entry.key));
  const body = {
    version,
    entries,
    complete,
    next_from: complete ? 0 : from + page.length,
  };
  return known
    ? { form: "delta", base_version: have_version, ...body }
    : { form: "snapshot", ...body };
};

/**
 * A key this build declares AND withholds from devices. An unknown key is NOT cloud-only — see
 * the note in `configPage`.
 */
const isCloudOnly = (key: string): boolean => isConfigKey(key) && !isDeviceConfigKey(key);
