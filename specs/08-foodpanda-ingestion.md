# 08 — Aggregator Ingestion (foodpanda first)

**Module spec — Draft 1, July 2026** · Status: draft for review · Parent: `00-platform-overview.md` (conventions §5–§7 inherited), `01-kernel-sync.md`. Concept refs: v2 concept §4.2 (foodpanda), §9 risk 2; v1 spec §3.4 (Module D detail). Wave 1 (manual mode) / Wave 4 (API mode).

## 1. Purpose & scope

Aggregator orders must land in the same kernel queue as every other channel — channel-tagged, KOT-printed, inventory-deducted — without staff re-keying. Two modes, both permanent:

- **Mode 1 — manual quick-entry (Wave 1, always available):** a 30-second channel-tagged order entry on POS. The UI lives in doc 02; **this doc owns the mapping model and channel semantics** the UI implements. Mode 1 is the standing fallback for any org without API access, and the risk hedge if API access tightens market-wide (v1 spec §10.1).
- **Mode 2 — Delivery Hero POS API (Wave 4):** direct order ingestion for Pakistan, menu mapping, availability push, and store pause — behind a **generic aggregator-driver interface** of which foodpanda is the first implementation. Careem Now and others are later drivers, never later systems (design law 4 applied to third-party doors).

Used by: counter staff (Mode 1), the kitchen and downstream modules (both modes), the onboarding team (menu mapping via doc 15 tooling). Runs as `services/foodpanda` (driver host) plus the POS quick-entry surface.

## 2. Position in platform

- **Consumes:** `availability.changed` (01-F22 → push to aggregator), `channel.paused / resumed` commands (from doc 05 channel pulse), catalog reference data + menu mapping, `order.line_state_changed` (optional status push where the API supports it), org channel config (doc 14), onboarding mapping tooling (doc 15).
- **Emits:** `aggregator.order_received / order_accepted / order_rejected / availability_pushed / push_failed / pause_applied / pause_failed`, `order.created`, `order.channel_tagged`. (`channel.paused / resumed` commands are owned and emitted by doc 05 only; this module emits the `aggregator.pause_*` results.)
- **Downstream consumers:** docs 02/03 (queue + KOT), doc 10 (recipe deduction), docs 12/13 (channel-economics reporting from the commission config), doc 15 (mapping-debt and push-failure fleet health).
- **Extends 01 §4 catalog** (spec PR): the `aggregator.*` family (`channel.paused / resumed / throttled` are doc 05's extension).

## 3. Functional requirements

**Channel semantics (both modes)**
- 08-F1 Every aggregator order is a normal kernel order: `order.created` with `channel: 'foodpanda'` (or other driver id) plus `order.channel_tagged` payload `{ channel, mode: 'manual' | 'api', aggregator_order_ref, aggregator_delivery: 'aggregator_rider' | 'own_rider' }`. It enters the one branch queue, prints KOT (doc 03), and deducts inventory (doc 10) identically to any order.
- 08-F2 Aggregator orders never write to the org customer file: foodpanda withholds customer identity; the masked name/short code is stored on the order payload only. No fabricated customer records (automation law, 00 §5.8).
- 08-F3 **Commission % per channel is org-level config** (basis points, integer), set at onboarding via docs 14/15, historically versioned via `config.changed`. This module guarantees the tag + config exist; channel-economics math (net revenue per channel) is computed by docs 12/13. The % is reporting config only — this module never moves money.
- 08-F4 Sequencing/visibility of aggregator orders in the queue follows ops-fabric rules (concept §4.1): channel badge + aging colors, chronological — no priority lane, ever.

**Mode 1 — manual quick-entry (semantics owned here, UI in doc 02)**
- 08-F5 Quick-entry creates a real order from mapped catalog items in ≤ 30 s for a typical 3-line order: channel pre-tagged, aggregator short order-ref field (mandatory, read off the foodpanda tablet), payment method auto-set `aggregator_settlement` (no cash expected at branch when foodpanda's rider delivers).
- 08-F6 Items entered are catalog items — the same grid as dine-in POS. Where the foodpanda menu diverges from the catalog (bundles/deals), doc 14's catalog carries mapped alias items so quick-entry never needs free-text lines. Unmappable one-offs use a flagged `unmapped_aggregator_line` placeholder (name + price captured, no recipe deduction) that surfaces in the doc 15 mapping-debt report.
- 08-F7 Editing/void of aggregator-tagged orders follows normal POS rules (void with approver post-KOT); the `aggregator_order_ref` makes end-of-day reconciliation against the foodpanda partner portal possible (doc 12 report).

**Mode 2 — Delivery Hero POS API**
- 08-F8 Webhook order ingestion: verify signature → persist raw payload (`aggregator.order_received`) → normalize via the driver → `order.created` + `order.channel_tagged` into the kernel queue. **Confirm policy: aggregator API orders auto-confirm on ingest** (`order.confirmed` emitted with creation — acceptance already happened upstream on the aggregator side, per the indirect-flow reality); manual quick-entry orders are confirmed by the act of entry (02-F30). KOT follows `order.confirmed` (03), never precedes it. Idempotent on aggregator order id under webhook redelivery.
- 08-F9 **Menu mapping:** foodpanda item/variant/topping ↔ catalog MenuItem/Variant/Modifier, built at onboarding with doc 15 tooling, versioned, validated (every active foodpanda item maps or is explicitly excluded). An incoming line with no mapping still ingests via the 08-F6 placeholder — an order is never dropped for mapping debt — and raises a mapping alert.
- 08-F10 **Availability push:** on `availability.changed` for a mapped item, the driver pushes item availability to foodpanda ≤ 60 s. Push failures emit `aggregator.push_failed` and retry (BullMQ); persistent failure raises a manager-console + fleet-health alert — the 86 is never assumed delivered (00 §5.7 honesty).
- 08-F11 **Accept/reject — the honest contract:** the default integration is the **indirect flow**: order acceptance stays on the foodpanda tablet; we ingest in parallel and eliminate re-keying — the tablet may remain on the counter. Where DH enables the direct flow for an org, the driver auto-accepts within the DH deadline using the org's configured default prep time (aggregators cancel unaccepted orders; a branch tap cannot be the gate). `aggregator.order_accepted / order_rejected` record whichever path occurred, including tablet-side acceptance where the API makes it observable. This spec makes no promise that the tablet disappears.
- 08-F12 Direct-flow branch-offline fail-safe: if a branch's sync liveness exceeds a threshold (default 5 min) while direct flow is on, the driver pushes store-pause to foodpanda rather than accepting orders into a black hole; on reconnect it resumes and already-accepted queued orders enter the branch queue with original timestamps. This is 00 §5.1 honesty applied to a third party's customer.
- 08-F13 Optional status push (preparing/ready) to DH where the API version supports it, driven by `order.line_state_changed` — enabled per org, best-effort, never blocking the kernel flow.

**Channel pause/throttle contract (invoked from doc 05 channel pulse)**
- 08-F14 Doc 05 emits `channel.paused { channel, branch_id, scope: 'pause' | 'throttle', minutes?, reason }` / `channel.resumed`. This module maps the command to driver capability:
  - API mode with `pauseStore` → store-pause, or prep-time increase for `throttle`;
  - manual mode (or missing capability) → **advisory only**: a banner on the quick-entry surface ("kitchen overloaded — pause foodpanda on the tablet?"), because we control nothing upstream.
  - The result event always states which of the two happened, so doc 05 shows the truthful effect, never an assumed one.

**Generic aggregator-driver interface (defined here; foodpanda is driver #1)**
- 08-F15 Every aggregator integrates via `AggregatorDriver` (lives in `packages/domain`):
  ```ts
  interface AggregatorDriver {
    readonly channel: string;                       // 'foodpanda', 'careem_now', …
    readonly capabilities: {
      ingestOrders: boolean; pushAvailability: boolean; pushMenu: boolean;
      pushOrderStatus: boolean; remoteAccept: boolean; pauseStore: boolean;
    };
    verifyWebhook(req: RawWebhook): boolean;
    normalizeOrder(raw: unknown, mapping: MenuMapping): NormalizedAggregatorOrder;
    pushAvailability(branchRef: BranchRef, changes: AvailabilityChange[]): Promise<PushResult>;
    setStorePaused(branchRef: BranchRef, paused: boolean, minutes?: number): Promise<PushResult>;
    acceptOrder?(ref: string, prepMinutes: number): Promise<void>;
    rejectOrder?(ref: string, reason: string): Promise<void>;
    pushOrderStatus?(ref: string, status: 'preparing' | 'ready'): Promise<void>;
  }
  ```
  `NormalizedAggregatorOrder` carries: `aggregator_order_ref`; branch resolution (aggregator vendor id ↔ `branch_id`); lines (mapped item/variant/modifiers, qty, unit price in paisas — or unmapped placeholder); totals as stated by the aggregator; delivery type; masked customer name/note; aggregator timestamps. The core service owns webhooks, queueing, retry, and kernel emission; drivers own only translation and transport.
- 08-F16 Capability flags drive honest UI: a channel without `pauseStore` renders advisory-only in doc 05; one without `pushAvailability` shows "86 does not reach this channel" in availability surfaces. Adding a new aggregator = new driver + mapping data + doc 15 onboarding entry — no kernel, POS, or KOT changes permitted, provable by the mock second driver in CI (08-N5).

## 4. Key flows

**Manual quick-entry (Mode 1 happy path)**
1. Foodpanda tablet rings → cashier taps Quick Entry (foodpanda) on POS.
2. Enters short order-ref + 3 mapped items from the standard grid (≤ 30 s).
3. Confirm → `order.created` + `order.channel_tagged` → KOT prints, deduction follows.
4. Order tracked in the one queue to handover to the foodpanda rider; nothing re-keyed later.
Failure path: order includes an unmapped deal → placeholder line captures name + price; the KOT carries its text; mapping-debt report picks it up for onboarding follow-through.

**API order, indirect flow (Mode 2 happy path)**
1. DH webhook arrives → signature verified → raw persisted (`aggregator.order_received`).
2. Driver normalizes via mapping → `order.created` + `channel_tagged` → branch queue.
3. POS shows it channel-badged; KOT auto-prints; staff accept on the foodpanda tablet as before — the tablet stays, the typing goes.
4. `aggregator.order_accepted` recorded when acceptance is observable; deduction and reporting flow as normal.
Failure path: duplicate webhook delivery → deduped on aggregator order id, single kernel order.

**Onboarding menu mapping (doc 15 tooling, contract from here)**
1. Onboarding engineer imports the org's foodpanda menu (API where available, else CSV/manual).
2. Tooling proposes matches against the catalog (name/price heuristics); engineer confirms, corrects, or excludes each item.
3. Validator passes → mapping version activated; Mode 1 alias items generated for divergent bundles.
4. Later foodpanda menu change → change webhook (or periodic re-import diff) → new unmapped items enter mapping debt → doc 15 report → onboarding follow-up. Orders never wait on this loop (08-F9).

**86 while listed**
1. Chef 86's karahi on the pass screen → `availability.changed` fast-path (01-F22).
2. Storefront hides it (doc 06) and this driver pushes unavailability to foodpanda ≤ 60 s → `aggregator.availability_pushed`.
3. Push fails → retries with backoff → persistent failure → `aggregator.push_failed` + manager alert (doc 05): "foodpanda may still be selling karahi" — stated, not hidden.

**Kitchen drowning (channel pulse)**
1. Manager triggers channel pulse (doc 05) → `channel.paused { scope: 'throttle', minutes: 20 }`.
2. API-mode org: driver raises prep-time on foodpanda; result event confirms the real effect.
3. Manual-mode org: advisory banner on the quick-entry surface, truthfully labeled advisory.
4. Recovery → `channel.resumed` → driver restores; result recorded.

**Direct flow, branch offline (fail-safe)**
1. Branch sync liveness exceeds 5 min with direct flow on.
2. Driver pushes store-pause (08-F12) → new foodpanda orders stop; fleet-health alert fires.
3. Branch reconnects → store resumed; the backlog of already-accepted orders enters the queue with original timestamps — aging colors show their true age to the kitchen.

## 5. Data

- **Owned (cloud Postgres):**
  - `menu_mappings` — per org × channel, versioned, with validation state and exclusions. A mapping record: `{ channel, aggregator_item_id, aggregator_variant_id?, catalog_item_id, catalog_variant_id?, modifier_map: [{ aggregator_topping_id, modifier_id }], status: mapped | excluded | debt, valid_from_version }`. The same shape serves Mode 1 alias items and Mode 2 normalization — one mapping model, two consumers.
  - `aggregator_orders` — raw payloads + normalization result + accept/reject trail.
  - `channel_config` — commission bps per channel, default prep-time, direct-flow flag, per-branch vendor-id bindings, offline fail-safe threshold.
  - Driver registry (channel id → driver + capabilities) and push job records (BullMQ).
- **Events emitted:** `aggregator.order_received / order_accepted / order_rejected / availability_pushed / push_failed`, `order.created`, `order.channel_tagged`, `channel.paused / resumed` results.
- **Events consumed:** `availability.changed`, `channel.paused / resumed` commands, `order.line_state_changed`, `config.changed`.

## 6. Non-functional requirements (module-specific)

- 08-N1 Webhook → kernel `order.created` persisted < 5 s p95; ingestion idempotent under DH webhook redelivery.
- 08-N2 Availability push meets 08-F10's 60 s under 200-branch load (01-N4 conditions); per-org queue isolation so one org's API failures never delay another's pushes.
- 08-N3 Mode 1 functions with zero cloud dependency — it is ordinary offline POS entry inheriting 00 §5.1. Mode 2 is cloud-side by nature; its branch-offline behavior is exactly 08-F12, with no pretend-online states.
- 08-N4 Raw aggregator payloads retained ≥ 90 days for dispute reconciliation; normalization is replayable from raw (01-F7 discipline).
- 08-N5 CI includes a mock-driver conformance suite: every driver passes identical normalization, idempotency, capability-honesty, and mapping-debt tests before it can ship.

## 7. Customizability

- **Layer 1 (platform admin, doc 15):** driver enablement per org, DH partnership credentials, mapping tooling and mapping-debt reporting, direct-flow enablement.
- **Layer 2 (org, doc 14):** commission bps per channel, default prep-time quote, status-push on/off, offline fail-safe threshold minutes (within platform bounds), per-branch vendor-id bindings.
- **Layer 3 (branch/device):** none beyond doc 02's quick-entry button placement.
- **Deliberately not configurable:** channel tagging (no untagged aggregator orders can exist), raw-payload retention, the order-never-dropped-for-mapping rule, the fail-safe's existence (only its threshold moves), and the commission % having any charging effect (it is reporting-only input to docs 12/13).

## 8. Tech notes

- `services/foodpanda` hosts the driver runtime: Fastify webhook endpoints, BullMQ for pushes/retries, Drizzle read models — per 00 §3. Drivers are in-process TS modules implementing 08-F15; no plugin sandboxing needed (first-party code only).
- DH POS API access: **apply at project start** — partnership lead time is a schedule risk (v1 spec §10.1); Mode 1 is a permanent tier, not a stopgap, so no org is ever blocked on the partnership.
- Menu-mapping tooling (doc 15) imports the foodpanda menu via API where available, else CSV/manual; the mapping validator runs on every catalog publish and on foodpanda menu-change webhooks.
- Vendor-id ↔ branch binding is per branch: multi-branch orgs have one DH vendor id per outlet.
- Careem Now (and any future aggregator) enters only through 08-F15/F16; its spec addendum is a capability-flag table + mapping quirks appended to this doc — not a new document.
- Foodpanda driver expected capability defaults (to be confirmed at partnership signing, §9 Q1): `ingestOrders: true`, `pushAvailability: true`, `pushMenu: false` (menu managed in the partner portal at launch), `pushOrderStatus: per API version`, `remoteAccept: per org direct-flow enablement`, `pauseStore: true`.
- Rush-simulation load tests (00 §4) include an aggregator webhook stream interleaved with in-branch orders to prove queue fairness (08-F4).

## 9. Open questions

1. DH API surface drift: which API version Pakistan tenants receive (status push and remote-accept availability vary) — capability flags absorb this; verify at partnership signing.
2. Whether tablet-side acceptance is observable via API in the indirect flow (for `aggregator.order_accepted` fidelity), or must be inferred from order progression — affects reconciliation detail only.
3. Deal/bundle decomposition: map bundles to composite catalog items (clean deduction, more onboarding work) vs single alias items (fast, coarser inventory) — decided per org appetite at onboarding; default is alias items.
4. Reverse availability (foodpanda marks an item unavailable on their side): ingest as advisory, or mirror into `availability.changed`? Bias: advisory only — the kitchen owns availability truth.
5. Throttle semantics on DH (prep-time increase vs order cap) — confirm which the Pakistan API exposes; the `channel.paused` contract already carries both shapes.
6. Whether Mode 1 quick-entry should capture foodpanda's stated payout total for sharper portal reconciliation — one extra field vs the 30-second budget; test at a Wave 1 pilot.
7. Foodpanda pick-up ("customer collects") order type: same ingestion path with `aggregator_delivery: 'customer_pickup'` extension, or excluded at launch — confirm the order-type surface in the DH API before deciding.
