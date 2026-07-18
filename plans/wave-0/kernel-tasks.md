# Wave 0 — Kernel spike task plan (owning spec: 01; exit criteria: 01 §8)

Sessions are sized to 1–4 FRs (24-F4). Acceptance tests per task are authored by a **different session** from spec text + this plan's contracts only (24 §3 step 2). Deleted after Wave 0 per plans/README.

### T-01-01  Domain foundation: ids, money brands, envelope, canonical states, event registry
- **FRs:** 01-F3 (envelope ordering fields), 01-F4 (typed event registry — unknown type is an error), 01-F31 (settlement_attempt_id on payment emissions), 01-F35 (terminal-state monotonicity as a pure function). Conventions: 00 §6 (UUIDv7, integer paisas/mg/ml, envelope shape), 01 §4 canonical line states.
- **Files touchable:** `packages/domain/src/**` (implementation session); `packages/domain/src/__acceptance__/**` (test session only).
- **Check:** `pnpm --filter @restos/domain test` + root `pnpm verify`.
- **DoD rung:** D1* (tests green; formal conformance derivation lands with T-01-00).
- **API contract (binding for the test session):**
  - `newId(): string` — UUIDv7, lexicographically time-ordered.
  - Branded ints: `paisa(n)`, `mg(n)`, `ml(n)`, `units(n)` — throw on non-integers/NaN/±Infinity; `addPaisa/subPaisa/sumPaisa` exact integer arithmetic.
  - `EventEnvelope` zod schema + `parseEnvelope(v)` — fields per 00 §6: `id, org_id, branch_id, device_id, actor_user_id (nullable), lamport_seq (int ≥0), device_created_at (epoch ms int), server_received_at (int|null), type, schema_version (int ≥1), payload, refs (string[])`.
  - `ORDER_LINE_STATES`, `TERMINAL_LINE_STATES`; `applyLineState(current, next) → { state, applied, anomaly? }` — legal transitions per 01 §4 (`placed→confirmed→in_prep→ready→served` | `ready→picked_up→delivered`; `voided/cancelled` exits from any non-terminal); terminal states never regress (anomaly `terminal_regression`, 01-F35); illegal jumps → anomaly `illegal_transition`, not applied.
  - `eventRegistry` seeded with `order.created`, `order.line_state_changed`, `payment.recorded`, `payment.refunded` payload schemas (01 §4, 01-F29/F31 fields: refunded references payment id, method `cash_out|raast_reversal_ref|khata_credit`; recorded carries `settlement_attempt_id`); `parseEvent(envelope)` → typed event; unknown type → `UnknownEventTypeError` (01-F4).
- **Assumptions stated:** `settled` is money-side, not a line state (01 §4); negative amounts rejected at the brand level — corrections are separate refund events, not negative payments (01-F33); registry starts with 4 seed events, the full catalog lands with its consuming modules (surgical minimum).

### T-01-00  Harness: conformance derivation tool + `verify:01`
- Vitest reporter → `conformance/01.yml` status derivation (24 §11.1); `verify:01` script. After T-01-01 (needs real test results to derive).

### T-01-02  sync-protocol wire messages (PROTOCOL.md → zod schemas + codec round-trip property tests, 20 §2.3)
### T-01-03  sync-client storage adapter + outbox core (the canonical durable queue, 18 §4) + kill-test harness seed
### T-01-04  Folds v1 per FOLDS.md (`open_orders`, `kitchen_queue`) + fold determinism/commutativity properties (01-N1, 01-F34)
### T-01-05  LAN mesh + hub election per HUB-ELECTION.md + in-process sim scheduler seed (20 §2.4)
### T-01-06  Spike exit run — 01 §8 criteria: 3 devices + virtual printer, WAN cut mid-rush-replay, plug-pull mid-print, partition/rejoin, zero lost/duplicated events, identical folds, LAN p95 < 1 s
