// T-01-07 Postgres data contract (binding — plans/wave-0/kernel-tasks.md T-01-07;
// owning spec 01 §3/§5): the four original kernel-schema tables, plus the
// T-01-08 quarantine-notice outbox (DEC-SYNC-008), the T-01-09 device
// registry, the T-C2 catalog pair, 01-F62's org-scoped store and 01-F68/01-F69/11-F20's
// tenancy directory — TWELVE in all. sync-gateway is the sole writer of all twelve (18 §4).
// (`kernel.users` has a second READER, `services/api`'s login path, and exactly one writer —
// this service. See the table's own comment; `0011`'s header states the split in full.)
// (This header read "six in all" while the file declared nine: a count in a comment rots
// silently, so it is a count of the `kernel.table(` declarations below — and this one was
// written "TWELVE" first and corrected against `drizzle-kit generate`'s own tally.)
// No UPDATE or DELETE of kernel.events exists anywhere in this
// package (01-F1 append-only ledger; quarantine/registry rows are mutable —
// heal-in-place T-01-11, revocation T-01-09 — but the event ledger never is).
// Ids are text, not
// uuid — the storage layer must not tighten the wire contract (assumption 11).
// envelope jsonb is verbatim-as-received; the two cloud-stamped values live in
// their own columns and are merged into the envelope at serve time (assumption 12).
// @unreached-by-design CONSUMED AT BUILD TIME, not at runtime. `drizzle.config.ts` points
// drizzle-kit at this file to generate `./drizzle/*.sql`; the gateway itself issues raw SQL
// through `postgres`, so no runtime module imports these table objects. The consumer is real and
// outside `src/`, which is why this reads as unreached.
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  index,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const kernel = pgSchema("kernel");

/** Merged org log (01-F3/01-F7): retained forever (01 §5); no partitioning at v1 (assumption 1). */
export const events = kernel.table(
  "events",
  {
    id: text("id").primaryKey(),
    org_id: text("org_id").notNull(),
    branch_id: text("branch_id").notNull(),
    device_id: text("device_id").notNull(),
    lamport_seq: bigint("lamport_seq", { mode: "number" }).notNull(),
    global_seq: bigint("global_seq", { mode: "number" }).notNull(),
    server_received_at: bigint("server_received_at", { mode: "number" }).notNull(),
    envelope: jsonb("envelope").notNull(),
  },
  (t) => [
    unique("events_org_global_seq_uq").on(t.org_id, t.global_seq),
    // The T-01-03 lamport-collision-is-corruption law, cloud side.
    unique("events_org_device_lamport_uq").on(t.org_id, t.device_id, t.lamport_seq),
    // Catchup paging (01-F9): the session's branch stream in global_seq order.
    index("events_org_branch_global_seq_idx").on(t.org_id, t.branch_id, t.global_seq),
  ],
);

/**
 * Per-org counter row (01-F3, assumption 2): locked FOR UPDATE inside the merge
 * transaction and held to commit — this serialization is what makes catchup
 * paging unable to skip a not-yet-visible lower seq (law 4).
 */
export const orgSequences = kernel.table("org_sequences", {
  org_id: text("org_id").primaryKey(),
  next_global_seq: bigint("next_global_seq", { mode: "number" }).notNull(),
});

/** Per-device high-water mark (01-F8): the source of hello_ack.resume_from. */
export const deviceWatermarks = kernel.table(
  "device_watermarks",
  {
    org_id: text("org_id").notNull(),
    device_id: text("device_id").notNull(),
    acked_watermark: bigint("acked_watermark", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.org_id, t.device_id] })],
);

/**
 * Quarantine storage (01-F37): invalid events verbatim, no global_seq, never in
 * kernel.events / fan-out / catchup. Re-quarantine of the same claimed id is an
 * idempotent no-op — first stored wins (UNIQUE below + ON CONFLICT DO NOTHING).
 * envelope is `text` (verbatim JSON string), NOT jsonb — bytes jsonb cannot
 * faithfully hold (e.g. U+0000 in any string) must still be quarantinable as
 * storage_reject (fix-round amendment 3).
 *
 * Heal-in-place is GONE (T-01-21): it existed only because the org-wide key let a
 * hub's placeholder occupy the origin's single slot. With one row PER CLAIMANT the
 * origin simply stores its own correctly-attributed row and nothing needs rewriting.
 *
 * The only UPDATE that remains is `superseded_at` — a placeholder whose event later
 * merged legitimately (review #7). The stored `envelope` is never rewritten (01-F1 —
 * a relay never re-authors), and a FOREIGN claim is never superseded, because
 * supersession keys on `envelope_author` (who WROTE the bytes) rather than on
 * `device_id` (who the row is attributed to). Those differ exactly where it matters.
 */
export const quarantine = kernel.table(
  "quarantine",
  {
    id: text("id").primaryKey(),
    org_id: text("org_id").notNull(),
    branch_id: text("branch_id").notNull(),
    device_id: text("device_id").notNull(),
    claimed_event_id: text("claimed_event_id").notNull(),
    reason: text("reason").notNull(),
    envelope: text("envelope").notNull(),
    received_at: bigint("received_at", { mode: "number" }).notNull(),
    // Review #7 (ruled): a placeholder whose event was later legitimately merged is
    // RETAINED and marked, never deleted — this table is evidence of what a device
    // tried to send, and deleting would leave an investigation a hole with no trace.
    // null ⇔ live; listQuarantine filters non-null out of the doc-15 live surface.
    superseded_at: bigint("superseded_at", { mode: "number" }),
    // WHO WROTE the stored bytes, as distinct from `device_id` (who the row is
    // attributed to). They differ exactly where supersession must discriminate: a
    // relayed placeholder is attributed to the hub but authored by the origin.
    envelope_author: text("envelope_author"),
  },
  // ONE ROW PER CLAIMANT DEVICE per claimed event id (audit-1 #6). The org-wide
  // (org_id, claimed_event_id) unique index is deliberately GONE: it let the FIRST
  // claimant own the only slot, so an honest origin arriving second had its envelope
  // DISCARDED ENTIRELY — bytes gone, not merely mis-attributed. A trivial insider
  // pre-claim destroyed exactly the evidence 01-F37 exists to preserve.
  (t) => [unique("quarantine_org_claimed_device_uq").on(t.org_id, t.claimed_event_id, t.device_id)],
);

/**
 * Device registry (T-01-09; 01 §5 names the cloud `device_registry` table;
 * 01-F25 registered/class-typed/revocable, 01 §7 layer-1 provisioning). The
 * REGISTRY — never the token, never the hello — is the authority for who may
 * open a session and who may be a relayed origin (18 §5). Rows are provisioning
 * bookkeeping, not event history: revocation SETS revoked_at (never deletes;
 * 01-F1 reaches the ledger only), and re-registration mints a fresh device_id
 * (T-01-09 ruled: wiped devices never collide with their old slots, 01-N5).
 * revoked_at null ⇔ active.
 */
export const deviceRegistry = kernel.table(
  "device_registry",
  {
    org_id: text("org_id").notNull(),
    branch_id: text("branch_id").notNull(),
    device_id: text("device_id").notNull(),
    device_class: text("device_class").notNull(),
    /**
     * `01-F70` — the device's HUMAN NAME ("Counter till", "Kitchen screen").
     *
     * On the registry row and not in device-local configuration (`00 §7` layer 3): the two
     * surfaces that need it — `14-F12`'s device list and `15-F11`'s fleet dashboard — are lists
     * of devices nobody is holding, and a name typed into a device's own environment is a name
     * only that device knows.
     *
     * **It is a LABEL and never an identifier.** `device_id` stays the sole key for admission,
     * fan-out, watermarks, relay attestation (`01-F13`) and `01-F64`'s store binding; two devices
     * may legitimately share a name and nothing may key on it.
     *
     * **Nullable HERE although `01-F70` makes it required at REGISTRATION**, on the precedent
     * `0005`/`0008` already set in this table and in `catalog_entries`: rows provisioned before
     * this migration have no name, and backfilling one would invent a fact about a physical
     * device nobody looked at. `01-F70` puts the refusal at the writer, and a device that has
     * not yet learned its own name renders per `21-F15`. The writer-side requirement is OWED —
     * `provision-device`/`registerDevice` do not yet take a `--name`.
     */
    display_name: text("display_name"),
    revoked_at: bigint("revoked_at", { mode: "number" }),
    // The cloud's record of this device's last-issued token expiry (T-01-18,
    // 01-F47). Load-bearing for hub-relayed renewal: a WAN-less origin's token
    // never reaches the cloud, so this column — not the credential — is how its
    // remaining life is judged (18 §5). Written at mint and at renewal only.
    token_expires_at: bigint("token_expires_at", { mode: "number" }),
  },
  (t) => [primaryKey({ columns: [t.org_id, t.device_id] })],
);

/**
 * Published catalog versions (T-C2; `01-F52`, `01-F9` "plus org-scope reference data").
 *
 * **ORG-scoped, never branch-scoped** — `01-F52` is explicit, and it is why a training branch
 * mirrors production read-only (`01-F49`) with no special case anywhere.
 *
 * The founder ruling (`plans/wave-1/catalog-transport.md` §6 Q1) is *the API publishes, the
 * gateway serves*: the back office decides what the menu IS and calls `publishCatalog`; this
 * service stores an immutable versioned artifact and answers device fetches from it. The
 * gateway never interprets an entry — `name`, `sort` and the rest pass through untouched — so
 * it cannot grow an opinion about menu structure, which was the whole point of the ruling.
 * `18 §4`'s "every table owns exactly one writer service" holds: that service is this one.
 *
 * Versions are per-org and strictly increasing. A row here is the COMMIT POINT — `catalog_entries`
 * rows are written first and this row last, so a reader that sees version N is guaranteed to see
 * every entry of version N. That ordering is the whole atomicity story for a paged fetch.
 */
export const catalogVersions = kernel.table(
  "catalog_versions",
  {
    org_id: text("org_id").notNull(),
    version: bigint("version", { mode: "number" }).notNull(),
    published_at: bigint("published_at", { mode: "number" }).notNull(),
    /** `14 §`'s actor, so `14-F6`'s price history has an author without reading the ledger. */
    actor_user_id: text("actor_user_id"),
  },
  (t) => [primaryKey({ columns: [t.org_id, t.version] })],
);

/**
 * What CHANGED at each version — a delta, never a full menu per version.
 *
 * This shape is chosen so the two things the device protocol asks for are both cheap and both
 * derived from one table: a **delta** from version A to B is `A < version <= B`, and a
 * **snapshot** at V is the greatest `version <= V` per `(kind, id)`. Storing a full menu per
 * version would make the delta a diff — the expensive direction, and the one that invites a
 * gateway to start comparing entries, i.e. to start understanding the menu.
 *
 * `deleted` is a TOMBSTONE row, not an absence (`01-F55`): a reprint of an order placed before
 * an item was deleted must still render its name, so a delete travels as a marked entry. The
 * oracle round found that the device side destroyed tombstones on every snapshot recovery;
 * carrying them explicitly here is what lets the device stop doing that.
 */
export const catalogEntries = kernel.table(
  "catalog_entries",
  {
    org_id: text("org_id").notNull(),
    version: bigint("version", { mode: "number" }).notNull(),
    kind: text("kind").notNull(),
    entry_id: text("entry_id").notNull(),
    name: text("name").notNull(),
    /** 03-F38 — a short kitchen name, so long item names stop being a KOT layout problem. */
    kitchen_name: text("kitchen_name"),
    parent_id: text("parent_id"),
    sort: bigint("sort", { mode: "number" }),
    deleted: bigint("deleted", { mode: "number" }).notNull(),
    /**
     * `01-F60` — the `(branch, channel) → integer paisa` grid, stored as jsonb.
     *
     * jsonb rather than a side table because the gateway is forbidden an opinion about menu
     * structure (the founder ruling this service is built on: "the API publishes, the gateway
     * serves"). A `catalog_prices` table would make this service join, filter and therefore
     * UNDERSTAND pricing; a column it passes through keeps it a store. The completeness rule
     * lives at the writer, in `publishCatalog`, which is where `01-F60` puts it.
     */
    prices: jsonb("prices"),
    /** `03-F50` — the kitchen station. Null means INHERIT from the parent, not "none". */
    station: text("station"),
  },
  (t) => [
    primaryKey({ columns: [t.org_id, t.version, t.kind, t.entry_id] }),
    // Both access paths in one index: the delta scan (org, version range) and the snapshot
    // fold (org, entity, greatest version).
    index("catalog_entries_org_kind_entry_version_idx").on(t.org_id, t.kind, t.entry_id, t.version),
  ],
);

/**
 * ORG-SCOPED events (`01-F62`, closing `DEC-SYNC-012`).
 *
 * **This is not `kernel.events` with a nullable branch, and the separation is the FR.**
 * `01-F62` rules shape (c): an org-scoped event "lands in an org-scoped audit store that is not
 * the branch ledger at all". It "never enters a branch stream and no device folds it", so it has
 * no `global_seq` (a branch delivery cursor), no `lamport_seq` (a per-device chain), no
 * `device_id`, and above all **no `branch_id` and no branch stamp** — the alternative the FR
 * rejected was putting a server value into `branch_created_at`, which would have made a branch
 * field carry a non-branch value and invited a fold to read it.
 *
 * `server_received_at` is the ordering authority (`01-F18`, `01-F62`), and it is trustworthy here
 * for the reason the FR gives: the cloud plane is the one place a clock is not a threat — the
 * inverse of the device-clock threat model `01-F43` was written for.
 *
 * `seq` is a surrogate arrival order, NOT an ordering authority a reader may interpret. It exists
 * because `server_received_at` is a millisecond and a bulk edit (`14-F8`) writes five records at
 * one instant on purpose, so reading them back needs a stable tiebreak. Nothing folds it and no
 * client is told about it.
 *
 * Append-only, like `kernel.events`: no UPDATE and no DELETE of this table exists anywhere in
 * this package (`01-F1`).
 */
export const orgEvents = kernel.table(
  "org_events",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    org_id: text("org_id").notNull(),
    /** The `01 §4` type. Only `01-F62`'s org-scoped set is accepted — see `appendOrgEvent`. */
    type: text("type").notNull(),
    /** `01-F5`/`02-F19` attribution. Nullable because the envelope schema says nullable. */
    actor_user_id: text("actor_user_id"),
    server_received_at: bigint("server_received_at", { mode: "number" }).notNull(),
    payload: jsonb("payload").notNull(),
  },
  (t) => [index("org_events_org_received_seq_idx").on(t.org_id, t.server_received_at, t.seq)],
);

/**
 * Durable quarantine-notice outbox (T-01-08 binding data contract; DEC-SYNC-008
 * accepted: at-least-once, keyed by ORIGIN device, live-sent + redelivered on
 * next hello, mark-on-send). One notice per claimed id, first wins (UNIQUE +
 * ON CONFLICT DO NOTHING — idempotent with the quarantine row). The ONLY column
 * ever updated is delivered_at: this is delivery bookkeeping, not event history,
 * so 01-F1's no-update law does not reach it (stated explicitly in the contract).
 */
export const quarantineNotices = kernel.table(
  "quarantine_notices",
  {
    id: text("id").primaryKey(),
    org_id: text("org_id").notNull(),
    branch_id: text("branch_id").notNull(),
    device_id: text("device_id").notNull(),
    claimed_event_id: text("claimed_event_id").notNull(),
    reason: text("reason").notNull(),
    created_at: bigint("created_at", { mode: "number" }).notNull(),
    delivered_at: bigint("delivered_at", { mode: "number" }),
  },
  (t) => [
    // Widened in lockstep with kernel.quarantine (T-01-21). Left at the org-wide pair
    // it would silently defeat the widening: the second claimant's row would exist but
    // its origin could NEVER be notified, so an honest device whose event was rejected
    // would simply never hear about it — the exact silence 01-F37 exists to prevent.
    unique("quarantine_notices_org_claimed_device_uq").on(
      t.org_id,
      t.claimed_event_id,
      t.device_id,
    ),
    // The hello-time drain query (undelivered notices for one device).
    index("quarantine_notices_org_device_delivered_idx").on(t.org_id, t.device_id, t.delivered_at),
  ],
);

/* ────────────────────────────────────────────────────────────────────────────
 * THE TENANCY DIRECTORY (01-F68, 01-F69) — `01 §5` has listed `orgs/branches`
 * among the cloud tables since Draft 1 and nothing created them.
 *
 * ⚠ READ THIS BEFORE ADDING A CONSTRAINT: **these two tables carry NO FOREIGN KEY
 * AND NOTHING REFERENCES THEM**, and that is `01-F68`'s own ⚠ clause, not an omission.
 * Events already exist under org ids that no row here names — that is the state of the
 * deployment today — so a referential constraint from `kernel.events` would refuse ingest
 * for exactly those orgs, and refusing ingest is refusing a sale a till has already rung
 * and persisted (`01-F17`, `00 §5.1`, `01-F2`). It also buys nothing: **admission is the
 * gate and it is one layer up** (`01-F25`/`01-F47`/`01-F48` — a device cannot push without
 * a registered, unrevoked, unexpired credential naming its org, and `01-F71` (c) quarantines
 * an envelope whose `org_id` disagrees with its session's).
 *
 * The ban is stated for LEDGER tables; it is honoured here for the DIRECTORY tables too,
 * and that extension is an interpretation rather than a quotation. Two reasons.
 * `branches.org_id → orgs.org_id` would make naming a branch impossible until its org is
 * named, turning a directory into an ordering gate on the reconciliation `01-F68` describes
 * ("an org with events and no record is UNNAMED, not invalid"). And
 * `device_registry.branch_id → branches.branch_id` would be far worse: every device
 * registered today has no branch row, so provisioning and admission would start failing
 * on a table added to hold a *name*. Ordering lives at the writer (`15-F26` provisioning),
 * which is where this service already puts completeness rules (`01-F60`, `publishCatalog`).
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `01-F68` — THE ORG AS A NAMED RECORD; `15-F25` — its lifecycle.
 *
 * The record holds four things and that is the whole of it. Operating profile and hardware
 * capability (`15-F4`), the fiscal province (`16-F19`), branding (`06`) and anything to do
 * with plan, billing, quota or metering (`15-F5a`, `15-F24`) are each owned by another FR and
 * deliberately absent — a column with no reader is a fact captured by human discretion and
 * left to drift (`00 §5.8`).
 *
 * `status` is `15-F25`'s CLOSED set — `active | suspended`, with **no third value**: a `closed`
 * org would be indistinguishable, in every enforcement path this product has, from a permanent
 * suspension plus revoked devices. It is stored as free text with no CHECK, exactly as
 * `device_registry.device_class` and `catalog_entries.kind` already are — this schema validates
 * closed sets at the writer (Zod), never in Postgres, and a second interpretation of a closed
 * set is the defect `03-F40`'s two sensor bit layouts cost this corpus.
 *
 * `display_name` is NOT NULL because `01-F68` makes it required. **Non-empty is NOT enforced
 * here** for the same single-interpretation reason; it is OWED at the writer, and this is the
 * one place a reviewer should check that claim was honoured when provisioning lands.
 */
export const orgs = kernel.table("orgs", {
  /**
   * UUIDv7 (`00 §6`), minted once at provisioning (`15-F4`) and **never reused**: `01-F1` makes
   * every event under it permanent, so a recycled id merges two restaurants' histories into one
   * ledger with no rule for separating them again. Unchanged as a join key — the envelope, the
   * registry and the catalog already share it.
   */
  org_id: text("org_id").primaryKey(),
  /** What the restaurant calls itself — the only value `21-F15` permits in an org's name slot. */
  display_name: text("display_name").notNull(),
  /** `15-F25`: `active | suspended`. Transitions are `config.changed` in the org's own ledger. */
  status: text("status").notNull(),
  created_at: bigint("created_at", { mode: "number" }).notNull(),
});

/**
 * `01-F69` — A BRANCH IS A NAMED RECORD UNDER EXACTLY ONE ORG.
 *
 * **`branch_id` is the primary key on its own, and that is the FR being enforced rather than a
 * departure from `device_registry`'s `(org_id, device_id)` pair.** "Under exactly one org" and
 * "never reused" are both untrue under a composite key, which would happily admit the same
 * `branch_id` beneath two orgs. `org_id` is carried and indexed because listing an org's branches
 * is the only read path this table has.
 *
 * **NO TIMEZONE COLUMN, and that is a refusal rather than a deferral** (`01-F69`): `01-F46`
 * anchors the business day to Asia/Karachi regardless of cloud region or device locale and makes
 * the cutover *hour* the layer-2 setting while the anchor itself is not configurable. A per-branch
 * timezone would be a layer-3 record overriding platform law (`00 §7` forbids it outright) and its
 * failure would be silent — every duration, day boundary, shift report and cash reconciliation
 * re-dating itself against a field nobody remembers setting. Multi-timezone is an amendment to
 * `01-F46`, not a column here.
 *
 * **Address and phone are DEFERRED to the FRs that will read them** — `16-F19` (province, branch
 * registration status) and `06-F9`/`06-F11` (delivery capture). What Wave 1 needs is a name.
 *
 * **A branch record is never deleted.** `01-F51`'s droppability is a *training*-branch property
 * argued from the fact that a training branch is by construction not history, and it extends to
 * nothing else; decommissioning a production branch is revoking its devices (`01-F42`, `14-F13`).
 */
export const branches = kernel.table(
  "branches",
  {
    /** UUIDv7, never reused — `01-F68`'s reasoning applies unchanged one level down. */
    branch_id: text("branch_id").primaryKey(),
    org_id: text("org_id").notNull(),
    /**
     * Required: a device's identity resolves against a branch (`01-F65`) and fan-out is keyed by
     * it (`01-F71` (d)), so an unnamed branch is printed by the till, the pass screen and the
     * fleet dashboard alike.
     */
    display_name: text("display_name").notNull(),
    /**
     * `01-F25`: `branch | prep_kitchen | storage`. Named `branch_type` rather than `type` on
     * `device_registry.device_class`'s precedent — the one existing column of exactly this shape.
     */
    branch_type: text("branch_type").notNull(),
    /**
     * `01-F49`: `production | training`. **There is no training flag anywhere in the kernel** —
     * a training branch is a real branch with a real ledger, and branch-scoped credentials,
     * fan-out and reporting isolate it for free. This column is that whole mechanism.
     */
    branch_class: text("branch_class").notNull(),
    created_at: bigint("created_at", { mode: "number" }).notNull(),
  },
  // The only read path: one org's branches.
  (t) => [index("branches_org_idx").on(t.org_id)],
);

/**
 * `11-F20` — THE PERSON AS A STORED RECORD, and `15-F26`'s first owner (`0011`).
 *
 * `01 §5` has listed `orgs/branches/users/roles` among the cloud tables since Draft 1. `0010`
 * added the first two; this is the third. **`roles` is not owed a table**: `01-F26`'s roles are a
 * CLOSED set declared once in `packages/domain`'s permission matrix, and a table of them would be
 * a second interpretation of a set the matrix already fixes — the `03-F40` argument this schema
 * applies to every closed set it stores.
 *
 * **What it replaces:** `services/api` assembles ONE owner at boot from `BOOTSTRAP_OWNER_EMAIL` /
 * `BOOTSTRAP_OWNER_PASSWORD_HASH` / `BOOTSTRAP_ORG_ID` into a process-local `Map` that dies with
 * the process — `15-F26` names that as a stopgap standing in a provisioning step's place.
 *
 * ⚠ **ONE WRITER, TWO READERS.** `18 §4` requires one writer service per table and that is this
 * one — the sole writer of every table in this file since T-01-07, and where the provisioning
 * commands live. `services/api` READS this table on the login path and never writes it. Two
 * services on one Postgres is not the cross-service *import* `18 §2` forbids; a second users table
 * in a second schema would be two answers to "who owns this org", which is the drift `18 §4`
 * exists to stop. `14-F14`'s user CRUD is owed and lands as a write through this service.
 *
 * **No foreign key to `kernel.orgs`**, on `01-F68`'s reasoning extended exactly as `branches`
 * extends it, plus one more that is specific to this table: it is read on the LOGIN path, so a
 * referential failure here is a restaurant locked out of its own back office. Ordering is enforced
 * at the writer (`15-F27`) — `create-owner` refuses an org with no record, by name.
 */
export const users = kernel.table(
  "users",
  {
    /** UUIDv7, never reused — `01-F1` makes attribution permanent (`11-F20`). */
    user_id: text("user_id").primaryKey(),
    org_id: text("org_id").notNull(),
    /**
     * The login handle. Unique **case-folded and globally**, not per org, because
     * `UserStore.findByEmail` takes an email and nothing else — `01-F71` (b) takes the org FROM
     * the authenticated subject, so a per-org index would admit two rows one lookup cannot choose
     * between. One human in two orgs therefore needs two emails; that is
     * `backoffice-catalog.md` Q3's open multi-org question, not this table's to answer.
     */
    email: text("email").notNull(),
    /** `11-F20`: required, non-empty. Non-empty is the writer's (Zod `DisplayName`). */
    display_name: text("display_name").notNull(),
    /**
     * An Argon2id PHC string from `domain`'s `hashPin` (`01-F61`'s cost floor, `01-F26`'s single
     * hashing story) — **never a password**. NOT NULL because a row that cannot authenticate is a
     * user who does not exist for every purpose this product has; `15-F26`'s set-credential link,
     * which a nullable column would be preparing for, needs a redemption surface behind `14-F1`
     * that does not exist yet (`15-F27` names the gap, and relaxing this later is additive).
     */
    password_hash: text("password_hash").notNull(),
    /** `01-F26`'s `(role, branch_id|null)` pairs. `branch_id: null` is org-wide (`15-F26`). */
    assignments: jsonb("assignments").notNull(),
    /**
     * `01-F61` — the identification grid's explicit position. Not derived: ordering by `user_id`,
     * name or recency inserts a new hire wherever it sorts and shifts every tile after it,
     * destroying the positional memory `27-F4` protects.
     */
    grid_ordinal: bigint("grid_ordinal", { mode: "number" }).notNull(),
    created_at: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    // `lower()` because `createMemoryUserStore` already folds on read; a durable store that folded
    // on read but not on write would admit `Owner@x` and `owner@x` and serve whichever it reached.
    uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`),
    // The only other read path: one org's people.
    index("users_org_idx").on(t.org_id),
  ],
);
