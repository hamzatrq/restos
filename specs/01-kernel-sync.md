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
- 01-F5 Audit events are ordinary kernel events, hash-chained per device: each carries the hash of the device's previous audit event. Concrete scheme (DEC-AUDIT-001, accepted): the `audit.*` family has five subtypes — `audit.login`, `audit.drawer_opened`, `audit.reprint`, `audit.threshold_override`, `audit.settings_changed`; each payload carries `prev_audit_hash: string | null` (`null` only for a device's first audit event); the hash is SHA-256-hex over the canonical-JSON serialization (UTF-16 code-unit key sort at every depth) of the envelope **with `server_received_at` omitted** — so a device-local event (`server_received_at` null) and its cloud-merged form hash identically. The chain is store-owned (the device stamps `prev_audit_hash` inside the append transaction; a caller-supplied value is rejected). The bare chain binds each event to its predecessor; **tail-truncation and last-event forgery are detected by the Auditor (20 §4.2) cross-checking each device's chain against the merged cloud log**, not by `verifyAuditChain` alone. Hashing is platform law (§7), not configurable.

**Materialization**
- 01-F6 Devices maintain materialized state tables (open orders, table map, availability, current shift) by folding events; folds are deterministic and replayable from the log.
- 01-F7 The cloud maintains per-module read models (Postgres) fed by the merged log; read models are disposable/rebuildable projections, never sources of truth.

**Sync — device ↔ cloud**
- 01-F8 Push: a device uploads its own events in `lamport_seq` order; the server acks the high-water mark; retries are idempotent (event `id` dedupes).
- 01-F9 Pull: a device subscribes to its branch's merged stream (plus org-scope reference data) over WebSocket; catch-up after offline is a range fetch from its last received global sequence.
- 01-F10 Devices tolerate out-of-order arrival of soft references (00 §6) — folds park events awaiting a parent for late resolution, never crash or drop. **Parking is by key-presence (July 2026, `26`):** an event carrying its full projection keys never parks — payments/refunds carry `order_id`, line edges carry `line_context` — so parking remains only for genuinely key-underivable references (e.g. an orphan `order.confirmed` ahead of its order). The parked list is indexed by `waiting_for`; drain touches only events awaiting the newly-arrived reference.
- 01-F11 Sync status (last push ack, last pull position, queue depth) is queryable by the host app for the honesty UI (00 §5.7).

**Sync — branch LAN mesh**
- 01-F12 Devices in a branch discover each other on the LAN (mDNS; manual IP fallback) and exchange events directly while WAN is down.
- 01-F13 One device acts as **branch hub** (deterministic election among the hub-eligible classes of 01-F39: `counter_electron` > `counter_rn` > `kitchen`; ties broken by lowest device id, compared lexicographically; re-election on hub loss < 10 s). Non-hub devices connect to the hub (star); the hub relays events branch-wide **and is the branch's cloud uplink for any device that has no WAN of its own** (DEC-SYNC-009, accepted — this supersedes the per-device-only reading in DEC-SYNC-004). A device that *has* WAN still runs its own cloud session (per-device sessions remain the default); a LAN-only device — the normal case when only the counter terminal is given internet — has its events relayed upward by the hub on its behalf, so no device's events can be stranded outside the cloud log. Relayed events are attested by the hub, never re-authored: origin `device_id`, `lamport_seq` and payload are carried verbatim (01-F1), and the cloud tracks lamport contiguity per origin device.
- 01-F14 Every **hub-eligible** in-branch device (the hub-eligible classes of 01-F39) retains the full branch event stream for the rolling operational window (current business day + configurable N days); any device can therefore become hub or serve a cold-started peer.
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
- 01-F26 User × Role × per-location assignment; permission overrides per user; PIN (Argon2id) unlock on shared devices; idle auto-lock (device-layer setting). The permission matrix from `restaurant-os.md` Appendix A is the seed; roles are permission sets, not apps.
- 01-F27 Server-side authorization on every API/sync operation; device tokens carry device identity only — user identity comes from the PIN session; both are validated server-side (and hub-side on LAN, with cloud reconciliation).
- 01-F28 Offline auth: PIN verification works on-device against synced credential hashes; role changes propagate as reference data.

**Money contract (canonical — every payment-touching module conforms)**
- 01-F29 `payment.refunded`: carries `order_id`, its **own** `settlement_attempt_id` (01-F31), and references its parent payment by **`payment_attempt_id`** — the parent's attempt key; two fields, never one (a shared field would UKS-collapse two genuine partial refunds) (envelope-id parent refs superseded — one intent may legitimately exist under two envelope ids, which fragments any id-keyed cap, `26 §8`); the cap `Σ refunds ≤ un-refunded remainder` is a fold-evaluated **set** predicate whose violation surfaces as a monotone `violated` exception state gating the order's money rendering — never blocking a sale (01-F17); naming *which* refund busted the cap is definitionally sequence-dependent and is the **gateway's** job at merge (DEC-SYNC-007), quarantining per 01-F37; method `cash_out | raast_reversal_ref | khata_credit`; reason; actor + approver — **refunds always require manager approval** (they are a leakage vector). Partial refunds by amount or by listed line ids; a food-return refund links its `void.recorded`/`comp.recorded`.
- 01-F30 Conservation invariants, executable in `packages/domain` and enforced by the Auditor (20 §4.2) and property tests: per order, `Σ tendering payments (purpose: settles_order) − Σ refunds = billed_total − void_value − comp_value − discounts` once settled; khata receivable = billed − Σ tendering payments, decremented by `purpose: repays_receivable` payments (DEC-MONEY-007); split bills: Σ(child billed) = parent billed at split time; a fully-voided order nets to zero.
- 01-F31 Payment/refund idempotency: every emission carries a UI-layer `settlement_attempt_id` — double-taps and retries can never double-record; event-id dedupe (01-F8) covers transport duplicates. **Uniqueness law (ratified):** the token is **org-globally unique, UI-minted, UUID-class** — never a per-device counter (a colliding counter collapses two genuine payments into one key and cash vanishes silently, converged everywhere). Folds dedupe by attempt key: unique-keyed maps whose Σ skips disputed keys. **The payload minus its key is the immutable intent** — members diverging in *any* field (amount, method, purpose, parent ref) mark the key disputed, contribute **zero**, raise an anomaly, and are all retained; a fold never picks a winner. Cross-**order** attempt-id collision is fold-undetectable in principle — enforcement is mint-time + gateway.
- 01-F32 Channel closure: aggregator-collected orders settle as `payment.recorded { method: aggregator_receivable }` (doc 08 reconciles against payouts); khata repayments are `payment.recorded { purpose: repays_receivable }` referencing original orders (02-F14) — excluded from `pay_total` by 01-F31's keyed sum, so a repaid tab can never read as overpaid (DEC-MONEY-007). No order reaches settled state with conservation violated.
- 01-F33 Settlement is an **act, not a derivation**: `order.settlement_closed` (cashier-emitted, offline-legal) closes the money side as a monotone fact — nothing arithmetic settles or un-settles an order, and a late line-add raises `uncovered_addition` rather than reopening (a derived predicate over an append-only log cannot be both monotone and a pure function of the set, `26 §7`). Post-settlement corrections are always linked event pairs (refund + void/comp; fiscal credit note via doc 16 when active). Order "reopening" does not exist.

**Convergence contract (formalizes 01-N1)**
- 01-F34 Fold **merge** law (rewritten July 2026 on DEC-PERF-001 ratification; formerly "Fold-ordering law"): every fold declares an explicit merge rule per projected field — grow-only set/map union, unique-keyed sum (01-F31 attempt keys), monotone fact, supersedes-DAG head-set, or an explicitly rendered contested set — per the normative matrix (`26 §7`, `plans/wave-0/merge-semantics-matrix.md`). Device folds read **no ordering metadata**: no `global_seq`, no `lamport_seq`, no device clock — property-tested by **bijective envelope-id relabeling** and sequence/clock-injection invariance (equal delivered set ⇒ byte-equal projection; plain convergence alone is insufficient — a min-id tiebreak passes it while smuggling wall clock through the UUIDv7 prefix). `global_seq` remains the delivery/catch-up cursor and compaction watermark (01-F3), never a business arbiter; the two legitimate gateway-side sequence uses are enumerated in `26 §7`. ~~For the closed LWW list (01-F18) and any genuinely order-sensitive read model, the cloud's global org sequence (01-F3) is the tiebreak; devices converge to cloud ordering on ack~~ — superseded: cloud-plane catalog LWW (01-F18, `server_received_at`) is unchanged; device-plane folds never tiebreak by sequence.
- 01-F35 Terminal-state monotonicity: an entity in a terminal state ignores later non-terminal transitions; the ignored event is retained and flagged as an anomaly — folds never regress. This, not 01-F16, is what makes duplicate "same action" events safe (e.g. `rider.delivered` from both the rider app and an on-behalf counter entry).
- 01-F36 Approval idempotency: `approval.granted / denied` applies only while its request is pending; duplicates and stale responses are logged no-ops.
- 01-F37 Rejection & quarantine: an event failing schema, authorization, or invariant validation at hub or cloud is quarantined — stored verbatim, excluded from folds, surfaced to fleet health (doc 15), originating device notified. Resolution is an explicit operator action producing correction events; where the origin device already folded the event locally, the correction event defines the reconciliation. A quarantined event is durably stored, so it **fills its lamport slot** for watermark/ack purposes: the push ack advances past it and the device outbox never wedges on a poison event (DEC-SYNC-005, accepted; the 01-F17 never-blocked spirit). The Auditor's lamport-gap check counts quarantine rows as slot-filling (20 §4.2).
- 01-F38 Split/merge races while partitioned: both results stand on merge (01-F19 pattern) with a conflict badge; staff resolve via new events; nothing auto-discards.

**Device classes & sync slices (formalizes scoped sync)**
- 01-F39 Device classes (canonical identifiers — the `DEVICE_CLASSES` vocabulary declared once in `packages/domain`) with fixed slice + hub rules: `counter_electron` (counter POS, Electron host — full branch window, hub-eligible), `counter_rn` (counter POS, React Native host — full branch window, hub-eligible), `kitchen` (pass screen / KDS station, doc 03 — full branch window, hub-eligible), `manager` (full slice, never hub — personal phone), `waiter` (scoped: own-table orders, availability, own events; LAN member, never hub), `rider` (cloud-only scoped: assigned orders + own events; never joins the branch LAN). Hub-eligible is exactly {`counter_electron`, `counter_rn`, `kitchen`}, listed here in 01-F13 election-priority order. 01-F14's full-window retention applies to hub-eligible classes.
- 01-F40 Slice predicates are enforced server-side and hub-side from device class + role — never client-declared. A scoped device requesting outside its slice is denied and flagged.
- 01-F41 Reassignment backfill: reassigning an entity (table to another waiter, order to another rider) triggers targeted backfill to the new device and halts delivery to the old one.
- 01-F42 Revocation & purge: a revoked device or role receives a local-purge command on next contact (cloud or LAN); scoped devices cold-start from slice backfill only (< 2 min on 4G).

## 4. Event-type catalog (seed set)

**Canonical order-line states** (the only vocabulary any module may use; storefront display labels map onto these, 06-F18): `placed → confirmed → in_prep → ready →` terminal service state — `served` (dine-in/takeaway/pickup) **or** `picked_up → delivered` (delivery, **rider-driven only** — never advanced by payment/settlement, 09) — with `settled` closing the money side and `voided / cancelled` as exit states. Order-level "ready" is the fold of all lines ready (03-F19/F24); it is never a separate state.

`order.created / confirmed / line_added / line_removed† / line_state_changed / line_price_overridden / note_added / table_assigned / merged / split / parked / unparked / channel_tagged / settlement_closed` · `payment.recorded / split_recorded / refunded` · `aggregator.payout_recorded` · `void.recorded / comp.recorded / discount.recorded` (†removal pre-KOT is a plain event; post-KOT it must be a `void.recorded` with approver) · `kot.printed / reprint_requested / print_failed` · `receipt.printed / reprint_requested` · `printer.status_changed` · `availability.changed` · `table.state_changed` · `eta.estimates_published` · `approval.requested / granted / denied` · `channel.paused / resumed / throttled` · `shift.opened / closed` · `day.opened / closed` · `cash.drawer_opened / paid_out / deposit_recorded` · `stock.movement_recorded / purchase_recorded / transfer_sent / transfer_received / production_recorded / wastage_recorded / count_recorded` · `staff.clocked_in / clocked_out / advance_recorded / advance_repaid` · `customer.created / merged / address_added` · `rider.assigned / picked_up / delivered / settled` · `metering.usage_recorded` · intelligence family (doc 13): `brief.generated` · `alert.raised / acknowledged` · `suggestion.issued` · `action.proposed / approved / rejected / executed / reversed` · `autonomy.rung_changed` · admin family (docs 14/15): `catalog.changed` · `device.registered / revoked` · `user.changed` · `audit.*` · `config.changed`. Payload schemas in `packages/domain`; modules extend this catalog via spec PRs to their own doc + this list (extensions above were declared by docs 02–15 and are absorbed here as canonical).

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
