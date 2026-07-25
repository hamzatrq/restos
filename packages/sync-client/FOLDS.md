# Fold registry v1 (24-F8 artifact for spec 01 — implementation follows in T-01-04)

> ## ⚠️ STALE — pre-implementation artifact. Do not read as the shipped design.
> This is the T-01-04 planning artifact and predates **T-01-15** (the merge-semantics fold engine) and **spec 26**. It still describes the **superseded comparator law** ("LWW entities tiebreak on cloud `global_seq`"), a single-column `orders` schema that does **not** match the shipped 15-key `OpenOrderRow`, and six folds of which only two (`open_orders`, `kitchen_queue`) are implemented. **Authoritative sources for the shipped engine:** `README.md` (this package), `src/folds/merge.ts`, and `specs/26-merge-semantics.md`. Retained for historical context only.


Laws (01-F34/F35, 01-N1): every fold is a pure `(state, envelope) → state`, commutative and idempotent over concurrently-received events, respecting per-device lamport order; terminal states never regress (anomalies recorded, never applied); events referencing unseen parents are **parked** and re-applied on arrival (01-F10); LWW entities (catalog/config, 01-F18) tiebreak on cloud `global_seq`. Canonical JSON in fold state sorts object keys **by UTF-16 code unit** at every depth (pinned so non-JS refold-and-diff implementations byte-match, 20 §4.2).

| fold | device classes | state table (SQLite) | consumes |
|---|---|---|---|
| `open_orders` | counter_electron, counter_rn, kitchen, manager, waiter(sliced) | `orders(order_id PK, channel, order_type, table_id, confirmed_at, settled, json_lines)` | order.*, payment.*, void/comp/discount |
| `kitchen_queue` | counter_electron, counter_rn, kitchen, manager | `queue(order_id PK, confirm_at, channel, age_basis, lines_ready, lines_total)` | order.created, order.confirmed, order.line_added, order.line_state_changed, kot.printed |
| `availability` | all in-branch | `availability(item_id PK, available, changed_at, actor)` | availability.changed (fast-path, 01-F15) |
| `table_state` | counter_electron, counter_rn, manager, waiter(own) | `tables(table_id PK, state, order_id)` | order.table_assigned/merged, table.state_changed, settlement |
| `shift_cash` | counter_electron, counter_rn, manager | `shifts(shift_id PK, cashier, open_at, expected_json, closed)` | shift.*, cash.*, payment.* |
| `sync_meta` | all | `meta(key PK, value)` — own high-water, last global_seq, hub state | protocol acks |

Parked events: `parked(event_id PK, waiting_for, envelope_json)` — drained on parent arrival; a parked event older than the rolling window raises an anomaly to fleet health. Money folds validate conservation (01-F30) inline in dev/staging, log-only in production (20 §4.2). Registration: folds live here in `sync-client`; apps register **derived views** only — new folds are a sync-client PR (18 §6).
