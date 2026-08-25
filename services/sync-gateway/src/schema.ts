// T-01-07 Postgres data contract (binding — plans/wave-0/kernel-tasks.md T-01-07;
// owning spec 01 §3/§5): the four original kernel-schema tables, plus the
// T-01-08 quarantine-notice outbox (DEC-SYNC-008), the T-01-09 device
// registry, the T-C2 catalog pair, 01-F62's org-scoped store, 01-F68/01-F69/11-F20's
// tenancy directory, 01-F75/01-F76/11-F23's staff-roster publication log with its
// credential table, and 01-F80/01-F73/01-F81's pending-pairing table beside an org's two
// keypairs — SEVENTEEN in all. sync-gateway is the sole writer of all seventeen (18 §4).
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
    /**
     * `01-F73` (b) — the LAN certificate this device was issued at pairing, as issued.
     *
     * **Kept rather than re-derived, and `01-F80` (d) is why:** re-presenting a code with the same
     * public key inside the TTL must return *the same certificate*, and a certificate's validity
     * window is stamped from the issuing instant — so re-issuing produces different bytes for the
     * same identity, which is `01-F73` (e)'s refusal read from the other end.
     *
     * Null for every device `provision-device` registered: that command mints an `01-F47` token
     * and no LAN credential, which is TRUE of those devices rather than missing from this row.
     */
    certificate_pem: text("certificate_pem"),
    /**
     * `01-F81` (a) — "the certificate fingerprint as lowercase hex SHA-256 of the DER", on the row
     * (f) names as the roster artifact's producer. Without it `01-F74` (c)'s pin half is
     * unbuildable and the chain alone "admits anything the issuer ever signed, including a device
     * revoked an hour ago".
     */
    certificate_fingerprint: text("certificate_fingerprint"),
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
     *
     * **NULLABLE since `0012` (founder ruling R30):** a cashier who only uses the till needs no
     * email — `11-F21` gives her a PIN as her working credential, and an owner made to invent an
     * address puts a wrong one permanently into a directory `11-F20` never deletes from. The
     * unique index below **survives unchanged**, because Postgres permits multiple NULLs in one:
     * R30 removes the requirement to *have* an address, not the rule about two people sharing one.
     * `findByEmail` simply does not find a till-only person, which is correct rather than a gap.
     */
    email: text("email"),
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
    /**
     * `01-F26`'s `(role, branch_id|null)` pairs, each carrying `11-F22`'s PARTICIPATION status.
     * `branch_id: null` is org-wide (`15-F26`).
     *
     * ⚠ **THERE IS NO `status` COLUMN ON THIS TABLE, AND ITS ABSENCE IS THE FR** (`11-F22`,
     * disambiguated August 2026). Participation is per-(person, branch): a cashier transferring
     * from A to B is *"`inactive` in A's roster and `active` in B's at the same moment"*, which no
     * single column can hold. `0012`'s first draft added the column, and the measured cost was the
     * defect `11-F23` names — deactivating her at A destroyed the credential B needs, and a later
     * republish at A re-copied her CURRENT status and returned a departed cashier to `active` with
     * a working PIN hash on her old branch's tills. It decides whether she may act at a location
     * and decides **nothing** about rendering: her row is retained forever (`11-F20`: "a person
     * record is never deleted") so her name still resolves on last month's orders.
     *
     * The status is required with **no default** — `11-F22` refuses one by name ("not a licence to
     * default an absent status to `active`") and `01-F75` makes the field required at the writer.
     * jsonb has no defaults to refuse, so the requirement lives entirely at the writer, in Zod,
     * through `packages/domain`'s `PersonAssignment`; `0012` backfills pre-existing rows to
     * `active` in one statement, which is `01-F68`'s reconciliation and not a standing licence.
     * No CHECK, for the same reason every other closed set in this file carries none.
     */
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

/* ────────────────────────────────────────────────────────────────────────────
 * THE STAFF ROSTER'S CLOUD STORAGE (`0012`) — `01-F75`, `01-F76`, `11-F21`,
 * `11-F22`, `11-F23`, and founder rulings R25/R32.
 *
 * ⚠ READ THIS BEFORE REACHING FOR `kernel.users`: the artifact is a PUBLICATION
 * LOG and the user table is CURRENT STATE. Serving a roster by selecting today's
 * `kernel.users` rows compiles, passes almost everything, and hands a device that
 * fetched v3 last week today's people labelled as last week's version — which
 * `01-F56`'s monotonic apply cannot detect, because the number it compares is
 * right. The two tables below are `catalog_versions`/`catalog_entries`' shape for
 * exactly `0007`'s reasons; what is NOT copied is the KEY, because the catalog is
 * org-scoped (`01-F52`) and this is branch-scoped (`01-F76`, R25).
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `11-F23` — THE DEVICE-PLANE PIN CREDENTIAL, IN ITS OWN TABLE.
 *
 * `services/api`'s login reads the user row by email; on a ninth column it would hold every
 * logged-in owner's *cashiers'* PIN hashes in the memory of a request that has no use for them.
 * A separate table means the login lookup cannot return the credential **because it does not join
 * to it** — a structural bound rather than a discipline. It also expresses `11-F21`'s active-only
 * rule as an ABSENCE rather than a NULL: no row, and the publisher's `left join` produces
 * `01-F75`'s specified shape without a branch.
 *
 * Keyed `(org_id, user_id)` although `user_id` is already globally unique, so that every read is
 * org-scoped by construction (`01-F71`). Its rows are UPDATEd (a `14-F14` PIN reset) and DELETEd
 * (R32 — a deactivated person's credential does not outlive her employment); neither is `01-F1`,
 * which reaches the ledger and not a credential.
 *
 * ⚠ **CORRECTED TWICE, AND THE SECOND CORRECTION IS WHY BOTH ARE RECORDED.** The sentence first
 * said "the one table in this file whose rows are updated … and deleted"; that was false when
 * written — `kernel.users` is declared one screen up and `staff.ts`'s `setUserStatus` UPDATEs its
 * `assignments` in the same transaction that deletes the row below. The repair then claimed *"every
 * other table in this file is append-only"*, **which is false for SIX of the fifteen** (re-measured
 * comment-blind 2026-08-18 by grepping the shipping writers for `update kernel.` /
 * `delete from kernel.` / `on conflict … do update`, with block and line comments stripped first):
 *
 *   · `kernel.device_registry` — `revoked_at`, `display_name`, `token_expires_at` (`registry.ts`)
 *   · `kernel.device_watermarks` — the acked cursor, upserted per push (`gateway.ts`)
 *   · `kernel.quarantine` — `superseded_at` (`gateway.ts`)
 *   · `kernel.quarantine_notices` — `delivered_at` (`gateway.ts`)
 *   · `kernel.org_sequences` — `next_global_seq`, the per-org counter (`gateway.ts`)
 *   · `kernel.users` — `assignments`, rewritten per participation flip (`staff.ts`'s
 *     `setUserStatus`) — the very table the sentence two paragraphs up names, and the one the
 *     repair's own count left out
 *
 * ⚠ **THIRD CORRECTION, AND IT WAS THE SAME NUMBER WRONG IN THE SAME DIRECTION EACH TIME.** The
 * headline said FIVE while the accounting below it already read `kernel.users` into its second
 * group, so one comment carried two counts of one set. Both earlier attempts are kept rather than
 * quietly overwritten, because the failure is a shape and not a typo: each sentence generalised
 * from the tables its own author had open, and the count is the part a reader trusts without
 * re-running anything.
 *
 * **What is true, and it is narrower than every attempt.** Commandment 1's append-only law is
 * about HISTORY, and the six history tables here — `events`, `org_events`, `catalog_versions`,
 * `catalog_entries`, `staff_versions`, `staff_entries` — are append-only. Everything else in this
 * file is current state rather than history: five of the six above are registry, cursor and counter
 * rows; the sixth, `kernel.users`, is written and rewritten by `staff.ts` alongside this table; and
 * `kernel.orgs` / `kernel.branches` are insert-only today only because `create-org` /
 * `create-branch` refuse to rename (`14-F2`), which is a writer's rule and not a property of the
 * table. That is 6 + 5 + 2 + 2 = 15. **If you need to know whether a given table is mutated, read
 * its writers — do not read a sentence in this file that counts them.**
 */
export const userCredentials = kernel.table(
  "user_credentials",
  {
    org_id: text("org_id").notNull(),
    user_id: text("user_id").notNull(),
    /** An Argon2id PHC string from `domain`'s `hashPin` (`01-F61`'s floor) — **never a PIN**. */
    pin_hash: text("pin_hash").notNull(),
    updated_at: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.org_id, t.user_id] })],
);

/**
 * `01-F75`/`01-F76` — the roster's publication VERSION axis, per `(resource, scope)` key.
 *
 * The resource is `staff` (this table); the scope is `(org_id, branch_id)` as **two columns and
 * never a concatenation** — `01-F71` (d): `("ab","c")` and `("a","bc")` are distinct tenants and a
 * separator-less key maps both to one delivery set, "a cross-tenant leak with no error in it".
 *
 * A row here is the COMMIT POINT exactly as `catalog_versions` is: entries first, this last, so a
 * reader that sees version N sees every entry of version N. Versions increase per KEY and mean
 * nothing across keys (`01-F76`: two devices at "staff v7" hold different bytes at different
 * branches). `branch_id` is NOT NULL because a primary key requires a value and the roster has no
 * org-scoped artifact — `publishStaffRoster` refuses a null branch **by name**, so the refusal is
 * a sentence rather than a constraint violation.
 */
export const staffVersions = kernel.table(
  "staff_versions",
  {
    org_id: text("org_id").notNull(),
    branch_id: text("branch_id").notNull(),
    version: bigint("version", { mode: "number" }).notNull(),
    published_at: bigint("published_at", { mode: "number" }).notNull(),
    /** The authenticated human behind the change, where one exists (`14-F14`). */
    actor_user_id: text("actor_user_id"),
  },
  (t) => [primaryKey({ columns: [t.org_id, t.branch_id, t.version] })],
);

/**
 * What CHANGED at each roster version — `01-F75`'s `staff` row, never a full roster per version.
 *
 * `status` is stored PER VERSION rather than read from `kernel.users` at serve time, and that is
 * the whole point of the log: at version 2 a member later deactivated still reads `active`,
 * because that is what was published. **A departure is a marked entry and never an absence** (R26,
 * `01-F75`) — there is no removals list and no tombstone column, because dropping her degrades a
 * past order, a reprint, a shift report and `02-F23`'s reconciliation to a raw UUID.
 *
 * `pin_hash` is NULLABLE and its absence is the **specified shape** (`11-F21`, `01-F75`): the hash
 * rides only an `active` entry, because a hash on a non-`active` one is a credential no verifier
 * can reach — pure blast radius with no function. It is a COPY as it stood at publication and not
 * a join, because a delta must be constructible from an exact base.
 *
 * `grid_ordinal` is `01-F61`'s explicit position, unique **within the artifact** and enforced at
 * the publisher against the folded artifact. Whether the cloud enforces it more widely "is a
 * storage choice this FR does not make", and no index here makes it — an org-wide unique index
 * would forbid two branches from both starting their grid at position 1, which `01-F75` permits.
 */
export const staffEntries = kernel.table(
  "staff_entries",
  {
    org_id: text("org_id").notNull(),
    branch_id: text("branch_id").notNull(),
    version: bigint("version", { mode: "number" }).notNull(),
    user_id: text("user_id").notNull(),
    display_name: text("display_name").notNull(),
    grid_ordinal: bigint("grid_ordinal", { mode: "number" }).notNull(),
    /** `11-F22`'s `active | inactive`, as published. No CHECK — the writer validates the set. */
    status: text("status").notNull(),
    /** `01-F26`'s `(role, branch_id|null)` pairs, carried so `can()` has a subject on the till. */
    assignments: jsonb("assignments").notNull(),
    pin_hash: text("pin_hash"),
  },
  (t) => [
    primaryKey({ columns: [t.org_id, t.branch_id, t.version, t.user_id] }),
    // ⚠ **THE DELTA SCAN USES THE PRIMARY KEY, NOT THIS INDEX — measured, because this comment
    // claimed "both access paths in one index" and `EXPLAIN` says otherwise.** `EXPLAIN (analyze,
    // buffers)` against a real Postgres 16, 2026-08-18, freshly `ANALYZE`d, 20 branches × 50
    // versions × 20 people = 20 000 entries, one branch served:
    //
    //   · snapshot fold (`version <= 50`) → Bitmap Index Scan on THIS index, all three of
    //     `org_id`/`branch_id`/`version` in the Index Cond, 1000 rows, 84 shared buffers.
    //   · delta fold (`version > 40 and version <= 50`) → **Index Scan using
    //     `staff_entries_org_id_branch_id_version_user_id_pk`**, 200 rows, 36 buffers. The planner
    //     is right: the PK orders `version` THIRD, so a version RANGE is a leading index condition
    //     there and here it is not — this index puts `user_id` third and can only carry the range
    //     as a non-leading condition inside a bitmap.
    //   · `staffVersion`'s `max(version)` → Index Only Scan Backward on that same PK, 1 row.
    //
    // So what this index actually buys is the snapshot fold, and only just: dropping it re-plans
    // that query onto the PK's bitmap at **89** buffers against 84 (same rows, same result). Kept
    // rather than dropped — an index change is a migration and 20 000 rows on one machine is not
    // the evidence for one — but the CLAIM is now what was measured. `catalog_entries`' index is
    // still the shape this follows, one axis wider for the scope; that similarity is not a
    // prediction about either query's plan, which is how the old sentence went wrong.
    index("staff_entries_org_branch_user_version_idx").on(
      t.org_id,
      t.branch_id,
      t.user_id,
      t.version,
    ),
  ],
);

/**
 * `01-F80` (a)/(b)/(c)/(d) — ONE PENDING PAIRING: a device an owner has described and nobody has
 * claimed yet.
 *
 * **It is not a device.** `01-F80` (c): "An unclaimed code that expires leaves nothing — no
 * registry row, no certificate, no device, nothing to clean up", and `14-F41` draws the same line
 * at the surface — "Before a claim there is no device" and "the waiting row BECOMES `14-F12`'s
 * device row". A row here is a **waiting row**; the claim is what writes `device_registry`.
 *
 * **`code_index` is the key and `code_hash` is the check, and the split is the one design decision
 * in this table** — see `0013`'s header for the three candidates and why a keyed blind index wins.
 * The index makes the lookup one SELECT; the Argon2id verifier at `01-F61`'s cost floor is what
 * actually admits the claim. Neither is the code (`01-F80` (b): "never the code").
 *
 * **`claimed_at` + `claimed_key_fingerprint` are `01-F80` (d) verbatim** — "the pending row records
 * the fingerprint of the key it issued over" — and they are why a dropped response is a retry
 * rather than a burned device.
 */
export const devicePairings = kernel.table(
  "device_pairings",
  {
    /** HMAC-SHA256(deployment key, code), lowercase hex. See `pairing.ts`. */
    code_index: text("code_index").primaryKey(),
    org_id: text("org_id").notNull(),
    branch_id: text("branch_id").notNull(),
    /** `01-F80` (a): minted HERE, by the owner's act — the claim never supplies one. */
    device_id: text("device_id").notNull(),
    device_class: text("device_class").notNull(),
    /** `01-F70`/`14-F41`: required at the mint, because nobody types a name on a till. */
    display_name: text("display_name").notNull(),
    /** Argon2id PHC at `01-F61`'s cost floor, over the eight digits. Never the digits. */
    code_hash: text("code_hash").notNull(),
    minted_at: bigint("minted_at", { mode: "number" }).notNull(),
    /** `01-F80` (c): `minted_at + 15 min`, stamped from the MINT's own instant. */
    expires_at: bigint("expires_at", { mode: "number" }).notNull(),
    /** `14-F41`'s issuing owner. Nullable for the same reason `actOf` is: a caller with no human. */
    actor_user_id: text("actor_user_id"),
    claimed_at: bigint("claimed_at", { mode: "number" }),
    /** Lowercase hex SHA-256 of the claimant's SPKI DER (`01-F80` (d)). */
    claimed_key_fingerprint: text("claimed_key_fingerprint"),
  },
  (t) => [index("device_pairings_org_branch_idx").on(t.org_id, t.branch_id)],
);

/**
 * `01-F73` (b) + `01-F81` (c) — an org's TWO keypairs.
 *
 * The issuer signs device certificates; the roster-signing key signs the device roster. They are
 * **distinct by requirement**: `01-F81` (c) refuses the obvious one-key design by name, because
 * `01-F74` (c)'s "a compromised issuer still cannot admit a device the roster does not name" is
 * false the moment one key does both jobs.
 *
 * Per **org**, never platform-wide (`01-F73` (b), `01-F71`, `00 §5.4`).
 *
 * ⚠ **The two private columns never leave this table.** `01-F73` (b·i): the device "never holds
 * issuing material". The claim reply carries the issuer's CERTIFICATE and the roster-signing
 * PUBLIC key and nothing else from this row.
 */
export const orgPki = kernel.table("org_pki", {
  org_id: text("org_id").primaryKey(),
  issuer_cert_pem: text("issuer_cert_pem").notNull(),
  issuer_private_key_pem: text("issuer_private_key_pem").notNull(),
  roster_signing_public_key_pem: text("roster_signing_public_key_pem").notNull(),
  roster_signing_private_key_pem: text("roster_signing_private_key_pem").notNull(),
  created_at: bigint("created_at", { mode: "number" }).notNull(),
});
