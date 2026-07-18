# 01 — Kernel: Event Ledger, Sync Mesh, Catalog, Customer File, Auth

**Module spec — Draft 1, July 2026** · Parent: `00-platform-overview.md` (conventions §5–§7 inherited). This is the foundation module — Wave 0. Every other module consumes it; it depends on nothing else.

## 1. Purpose & scope

The kernel is four things: (a) the **append-only event ledger** — the single source of truth for everything that happens in a restaurant; (b) the **sync mesh** — replication of that ledger between devices, branch LAN, and cloud; (c) the **shared reference data** — catalog (menu/recipes) and customer file; (d) **identity** — orgs, branches, devices, users, roles, sessions. It has no UI of its own; it ships as `packages/domain`, `packages/sync-client`, the cloud `sync-gateway`/`api-gateway` services, and the schemas under them.

All tiers and profiles run the identical kernel. A T1 single-terminal restaurant and a 5-branch fast-food org differ only in topology records, never in kernel behavior.

## 2. Position in platform

- **Consumed by:** every app and service (docs 02–17).
- **Depends on:** nothing internal. External: Postgres, Redis, object storage.
- **Emits/owns:** the event store itself; catalog and customer read models; auth/session/device registry.

## 3. Functional requirements

**Ledger**
- 01-F1 Append-only event log per org, following the canonical envelope (00 §6). No update/delete paths exist in any API. Corrections are new events referencing the corrected event id.
- 01-F2 Every device persists events locally (SQLite, WAL) before acknowledging the action to the UI. A confirmed action is a persisted event (plug-pull safe).
- 01-F3 Events carry `lamport_seq` per device (monotonic, persisted, gap-free). The cloud assigns `server_received_at` and a global org sequence on merge.
- 01-F4 The event-type catalog and payload schemas live in `packages/domain` (Zod). Producing an unknown/invalid event type is a build-time and runtime error.
- 01-F5 Audit events (login, drawer open, reprint, threshold override, settings change) are ordinary kernel events, hash-chained per device: each carries the hash of the device's previous audit event.

**Materialization**
- 01-F6 Devices maintain materialized state tables (open orders, table map, availability, current shift) by folding events; folds are deterministic and replayable from the log.
- 01-F7 The cloud maintains per-module read models (Postgres) fed by the merged log; read models are disposable/rebuildable projections, never sources of truth.

**Sync — device ↔ cloud**
- 01-F8 Push: a device uploads its own events in `lamport_seq` order; the server acks the high-water mark; retries are idempotent (event `id` dedupes).
- 01-F9 Pull: a device subscribes to its branch's merged stream (plus org-scope reference data) over WebSocket; catch-up after offline is a range fetch from its last received global sequence.
- 01-F10 Devices tolerate out-of-order arrival of soft references (00 §6) — folds park events awaiting a parent for late resolution, never crash or drop.
- 01-F11 Sync status (last push ack, last pull position, queue depth) is queryable by the host app for the honesty UI (00 §5.7).

**Sync — branch LAN mesh**
- 01-F12 Devices in a branch discover each other on the LAN (mDNS; manual IP fallback) and exchange events directly while WAN is down.
- 01-F13 One device acts as **branch hub** (deterministic election: highest-capability class wins — counter Electron > counter RN > pass screen > handheld; ties broken by lowest device id; re-election on hub loss < 10 s). Non-hub devices connect to the hub (star); the hub relays events branch-wide and is the preferred cloud uplink.
- 01-F14 Every in-branch device retains the full branch event stream for the rolling operational window (current business day + configurable N days); any device can therefore become hub or serve a cold-started peer.
- 01-F15 LAN propagation is fast-path: an event reaches all connected branch devices < 1 s p95 (00 §5.3). Availability toggles and order state changes ride this path.

**Conflict rules (explicit, closed list)**
- 01-F16 Two devices adding lines to the same order → merge (both valid).
- 01-F17 Stock going negative from offline oversell → allowed, flagged; reconciled at next count. A sale is never blocked by inventory math.
- 01-F18 Catalog/price edits → last-writer-wins by `server_received_at`, with full audit trail; the price on an order line is snapshotted at line-add and never re-derived.
- 01-F19 Same physical table opened on two devices while partitioned → both orders stand on merge; the table shows a conflict badge for staff to merge or reassign (a new event). Nothing is auto-discarded.
- 01-F20 Any conflict class not in this list must be designed as append-and-merge before a module may emit the event type. New LWW entities require a spec change here.

**Catalog**
- 01-F21 Catalog entities: Category → MenuItem → Variant → ModifierGroup/Modifier; MenuItem/Variant ↔ Recipe; InventoryItem (raw|prepared, base unit, conversions, `is_tracked`, par levels per location); PrepRecipe with yield %; Supplier + price history. Edited only via back office (doc 14); versioned; distributed to devices as reference-data snapshots + deltas over the same sync channel.
- 01-F22 Item availability ("karahi finished") is an operational event (not a catalog edit), toggleable from POS/pass/manager surfaces, propagated fast-path to every device and channel driver (storefront hides it, foodpanda availability push, doc 08).

**Customer file**
- 01-F23 One customer identity per org, keyed by normalized phone number (E.164); channels attach names/addresses to it. Merging two identities is an event; history is preserved.
- 01-F24 Customer data is org-scoped absolutely (00 §5.4). Cross-branch within an org: shared.

**Identity & auth**
- 01-F25 Org → Branch (type: branch | prep_kitchen | storage) → Device (registered, class-typed, revocable token). Registration is a one-time pairing via back office code; a revoked device loses cloud+LAN participation on next contact and is flagged branch-wide.
- 01-F26 User × Role × per-location assignment; permission overrides per user; PIN (Argon2id) unlock on shared devices; idle auto-lock (device-layer setting). The permission matrix from v1 spec §2.2 is the seed; roles are permission sets, not apps.
- 01-F27 Server-side authorization on every API/sync operation; device tokens carry device identity only — user identity comes from the PIN session; both are validated server-side (and hub-side on LAN, with cloud reconciliation).
- 01-F28 Offline auth: PIN verification works on-device against synced credential hashes; role changes propagate as reference data.

## 4. Event-type catalog (seed set)

`order.created / confirmed / line_added / line_removed† / line_state_changed / line_price_overridden / note_added / table_assigned / merged / split / parked / unparked / channel_tagged` · `payment.recorded / split_recorded` · `void.recorded / comp.recorded / discount.recorded` (†removal pre-KOT is a plain event; post-KOT it must be a `void.recorded` with approver) · `kot.printed / reprint_requested / print_failed` · `receipt.printed / reprint_requested` · `printer.status_changed` · `availability.changed` · `table.state_changed` · `eta.estimates_published` · `approval.requested / granted / denied` · `channel.paused / resumed / throttled` · `shift.opened / closed` · `day.opened / closed` · `cash.drawer_opened / paid_out / deposit_recorded` · `stock.movement_recorded / purchase_recorded / transfer_sent / transfer_received / production_recorded / wastage_recorded / count_recorded` · `staff.clocked_in / clocked_out / advance_recorded / advance_repaid` · `customer.created / merged / address_added` · `rider.assigned / picked_up / delivered / settled` · `metering.usage_recorded` · intelligence family (doc 13): `brief.generated` · `alert.raised / acknowledged` · `suggestion.issued` · `action.proposed / approved / rejected / executed / reversed` · `autonomy.rung_changed` · admin family (docs 14/15): `catalog.changed` · `device.registered / revoked` · `user.changed` · `audit.*` · `config.changed`. Payload schemas in `packages/domain`; modules extend this catalog via spec PRs to their own doc + this list (extensions above were declared by docs 02–15 and are absorbed here as canonical).

## 5. Data

- **Device SQLite:** `events` (own + branch stream, rolling window), `event_outbox` (unacked own events), materialized state tables per host app, `reference_data` (catalog/users snapshot + version).
- **Cloud Postgres:** `events` partitioned by org + month (retained forever); `device_registry`, `orgs/branches/users/roles`; per-module read models (owned by their modules, rebuildable).
- **Compaction:** devices prune the branch stream beyond the rolling window but always retain events referenced by open entities (unsettled orders, open shifts).

## 6. Non-functional requirements (module-specific)

- 01-N1 Replay determinism: folding the same event set in any received order (respecting per-device lamport order) yields identical state — property-tested (00 §4).
- 01-N2 Clock skew: device clocks are untrusted; skew > 5 min against server time raises a device health flag (doc 15) but never blocks operation.
- 01-N3 Storage budget: kernel footprint on a 2GB-RAM tablet ≤ 500 MB at the default rolling window under rush-simulation load.
- 01-N4 Cloud ingestion: sustain 50 orders/min × 200 branches on baseline infrastructure without backlog growth.
- 01-N5 A cold-started replacement device is operational (registered, reference data + branch window synced) < 10 min on 4G.

## 7. Customizability

- Layer 1 (platform admin): org/branch/device provisioning, revocation, rolling-window default.
- Layer 2 (org): roles/permissions within the matrix, approval thresholds, branch topology.
- Layer 3 (device): none beyond registration identity and station class.
- **Not configurable, ever:** append-only behavior, conflict rules, envelope schema, audit hash-chaining. These are platform law.

## 8. Tech notes

- Sync protocol: custom, over WebSocket (cloud) and LAN sockets; protobuf-free — JSON + zstd batch compression is sufficient at this event volume and keeps debugging trivial.
- **Build-vs-buy (DECIDED — full analysis in `19-sync-engine-decision.md`):** custom engine. Research (July 2026) confirmed no mainstream engine (PowerSync, Electric, Zero, Turso, LiveStore) provides LAN device↔device sync with WAN down; the only product that does (Ditto) is an opaque proprietary CRDT store conflicting with our auditability and self-host requirements. Our hub-relay topology matches Toast's documented production pattern. Exit ramp: Ditto evaluation if the Wave 0 spike fails twice (19 §6).
- Wave 0 spike exit criteria: 3 devices (Electron + 2 RN) + virtual printer; scripted rush replay with WAN cut mid-run; plug-pull mid-print; partition + rejoin with zero lost/duplicated events and identical folded state; LAN p95 < 1 s on shop-grade Wi-Fi.
- Hub election runs inside `packages/sync-client`; host apps only expose "I can be hub" capability class.
- Reference-data distribution reuses the event channel (config/catalog versions as events) — one replication path to test, not two.

## 9. Open questions

1. LAN transport detail: raw TCP vs WebSocket-over-LAN vs libp2p — decide in spike (bias: plain WebSocket, boring wins).
2. ~~Waiter BYOD scope~~ **Resolved by downstream specs:** waiter BYOD devices get a scoped sync slice (design in doc 04 §8); rider devices get a cloud-only scoped slice and never join the branch LAN (doc 09). The pull protocol must support per-device-class slice filters — implement in `sync-client`.
3. Multi-branch customer-file merge UX when the same phone orders at two branches concurrently (kernel handles the merge; who resolves name/address conflicts and where).
4. Event retention economics at year-2 scale — archive tier (S3 parquet) vs keep-hot in Postgres.
