# 17 — Marketing & Loyalty

**Module spec — Draft 1, July 2026** · Parent: `00-platform-overview.md` (conventions §5–§7 inherited), `01-kernel-sync.md` (customer file 01-F23, event contracts). Concept doc §4.7. Wave 4; requires docs 06 (storefront) and 07 (WhatsApp) live.

## 1. Purpose & scope

WhatsApp broadcast campaigns, promo/discount campaigns, simple count-based loyalty, and an honest campaign-vs-lift view. The module rides entirely on assets that already exist — the org's customer file (01-F23) and the WhatsApp rail (doc 07) — and introduces **no new data capture**: every fact it uses or produces is a side-effect of selling or an ingestion from the messaging channel.

- **Who uses it:** owner or marketing role (campaign creation in back office doc 14; lift views in docs 12/14); customers (storefront doc 06, WhatsApp doc 07); POS staff only at coupon/reward application (doc 02).
- **Runs on:** cloud (`marketing` backend module + jobs) + back office UI; application surfaces are existing apps (POS, storefront).
- **Tiers/profiles:** all profiles; most valuable where own channels are active. Feature-flagged per org (Wave 4 rollout).
- **Explicitly NOT:** ad-platform integrations (Meta/Google), a full CRM segmentation builder, email marketing, points-currency loyalty with tiers/expiry.

## 2. Position in platform

- **Events consumed:** `customer.created / merged / address_added`, `order.created / channel_tagged` and settlement (`payment.recorded`), `discount.recorded`; WhatsApp delivery/read receipts and opt-out messages ingested via doc 07 webhooks.
- **Events emitted:** `campaign.*`, `loyalty.*`, `customer.opted_out / opted_in` — added to the 01 §4 catalog by this spec (§5). `discount.recorded` gains an optional `campaign_id` payload field (additive change under the same schema version, 00 §6).
- **Integrates:** doc 07 (template registry, send infrastructure, metering, opt-out ingestion), doc 02 + doc 06 (coupon/deal validation and application; campaign definitions arrive as reference data over the kernel channel, 01 §8), doc 12/14 (lift views), doc 13 (may narrate lift in the brief — this module owns the numbers, doc 13 owns the words).

## 3. Functional requirements

**Audience segments**
- 17-F1 Preset segment types only, parameterized: `all_opted_in`; `lapsed` (no settled order in N days, default 30); `top_spenders` (top N by trailing 90-day spend); `channel` (ordered via channel C in trailing M days); `frequency` (≥ K settled orders in M days). A free-form segmentation builder is explicitly out of scope.
- 17-F2 Segments are stored definitions evaluated at send time — never static lists; every evaluation is logged with its resulting count and parameters. Preset parameters and bounds:

| Segment type | Parameters (Layer 2, within bounds) | Default |
|---|---|---|
| `all_opted_in` | — | — |
| `lapsed` | N days since last settled order (14–90) | 30 |
| `top_spenders` | top N by trailing 90-day spend (10–500) | 50 |
| `channel` | channel C, ordered in trailing M days (7–90) | 30 |
| `frequency` | ≥ K settled orders in M days (K 2–20, M 7–90) | 5 in 60 |
- 17-F3 A segment can only ever include customers whose opt-in status (doc 07 registry) permits marketing messages. This filter is applied inside the send path, not left to the campaign author.

**Broadcast campaigns**
- 17-F4 A broadcast campaign = WhatsApp-approved template (doc 07 registry) + segment + schedule window + optional attached promo (17-F10/F11). Draft → active → completed/paused lifecycle, all state changes evented.
- 17-F5 Opt-out is honored absolutely: checked per recipient at send time; an opt-out message (recognized variants, Urdu included) ingested by doc 07 takes effect immediately and permanently unless the customer explicitly re-opts-in. No role can override; no exception path exists in code.
- 17-F6 Per-org send metering: Layer 1 daily/monthly caps plus WhatsApp tier limits enforced in doc 07. When capped, sends throttle or halt and the campaign shows sent/pending/capped counts honestly — messages are never silently dropped.
- 17-F7 Delivery and read statuses from WhatsApp webhooks are attached to the send log (`campaign.message_status_ingested`). *(Ingestion.)*
- 17-F8 Quiet hours: broadcasts send only inside a platform-preset local-time window (default 11:00–21:00); a campaign scheduled across the boundary pauses and resumes. Not org-overridable beyond the preset bounds.
- 17-F9 Campaign completion produces a summary on the campaign record: audience count, sent/delivered/read, coupons redeemed, attributed orders/revenue, total discount value — the raw material of the lift view (17-F19).

**Promo / discount campaigns**
- 17-F10 Coupon codes: shared code or unique per-customer batch; constraints: validity window, channel scope, item scope, minimum order value, single-use or single-use-per-customer. Codes are short, uppercase, with a checksum character for typo detection at POS.
- 17-F11 Automatic deals: no code — time-window + channel + item scoped (e.g. "Tuesday 20% off karahi, storefront only"), applied automatically at POS/storefront when conditions match.
- 17-F12 Every promo application emits `discount.recorded` with `campaign_id`. Campaign discounts are pre-approved by the campaign definition: within its bounds, no manager PIN is required at POS (interplay with doc 02 approval thresholds); outside its bounds the normal threshold rules apply untouched.
- 17-F13 Offline validation: campaign definitions and shared codes validate from synced reference data with no cloud round-trip. Single-use enforcement is merge-checked: duplicate redemption across partitioned devices is append-and-merge (01-F20) — both stand, the duplicate is flagged to the manager and marked in the campaign report. A sale is never blocked by coupon arbitration.

**Loyalty (simple)**
- 17-F14 Count-based only: "every Nth order → reward" (free item or % off), one active program per org. Deliberately absent: points currencies, tiers, expiry mechanics.
- 17-F15 Progress is derived from settled orders on the customer file — org-wide, all channels, no punch cards, no manual adjustment. Crossing the threshold emits `loyalty.reward_earned`. *(Derived from side-effects; nothing to capture.)*
- 17-F16 Balance visibility: on the storefront (phone-keyed lookup) and in WhatsApp order notifications ("2 more orders to your free deal") via doc 07 templates.
- 17-F17 Redemption at POS or storefront is an attributed discount event: `discount.recorded` (with campaign/program ref) + `loyalty.reward_redeemed`. POS flow: customer phone lookup → reward visible → apply. Redemption resets the counter by event, append-only.

**Campaign-vs-lift view**
- 17-F18 Attribution rule (fixed, printed on every report): an order is campaign-attributed if (a) it carries a `discount.recorded` with that `campaign_id`, or (b) the ordering customer received that campaign's broadcast within the attribution window (default 7 days) before the order. An order attributable to multiple campaigns counts once, assigned to the most recent qualifying campaign (§9.4).
- 17-F19 Lift view (read model, surfaced in docs 12/14): attributed orders/revenue during the campaign window vs baseline = the same segment's trailing 4-week same-weekday average; total discount value given is shown alongside so the owner sees cost, not just lift.
- 17-F20 Honesty gating (design law 6): with insufficient baseline history the view states "not enough history to compute lift — showing raw campaign totals" rather than a fabricated comparison.

**Automation-law register (00 §5.8)** — every fact this module touches, classified:

| Fact | Class |
|---|---|
| Orders, discounts, redemptions | side-effect (of selling) |
| Delivery/read receipts, opt-outs/opt-ins | ingestion (WhatsApp webhooks) |
| Loyalty progress, segment membership, lift | derived — no capture |
| Campaigns, segments, loyalty program definitions | configuration, not facts |

No discretionary data entry is introduced; no staff member enters marketing data, ever.

## 4. Key flows

**Flow A — Broadcast campaign lifecycle**
1. Marketer drafts in doc 14: template (from the doc 07 approved registry) + segment + schedule window; optionally attaches a coupon batch or deal.
2. Activation validates the template status and metering headroom; campaign → active, `campaign.activated`.
3. At the send window, the job evaluates the segment (17-F2), then filters through opt-out (17-F5) and metering (17-F6).
4. Doc 07 sends, throttled to tier limits; each send logged (`campaign.message_sent`).
5. Delivery/read statuses arrive via webhook and attach to the send log (`campaign.message_status_ingested`).
6. The lift view starts populating from the first attributed order.
7. *Failure — template rejected by WhatsApp:* campaign blocked at draft with the reason shown; nothing sends.
8. *Failure — cap hit mid-send:* remaining recipients shown as capped, honestly; resumes at the next window; never silently dropped.

**Flow B — Coupon at POS (incl. offline)**
1. Cashier enters the code; checksum catches typos before any lookup.
2. Validation against locally synced campaign reference data — offline OK, < 100 ms (17-N3).
3. Constraints checked (window, channel, min order, item scope); discount applied without manager PIN within campaign bounds.
4. `discount.recorded` with `campaign_id` persists locally and syncs.
5. *Duplicate redemption across partitioned devices:* both events stand at merge (01-F20); the duplicate is flagged to the manager and marked in the campaign report; the sale is never unwound.

**Flow C — Loyalty earn and redeem**
1. A settled order increments the customer's derived progress (any channel, org-wide).
2. Threshold crossed → `loyalty.reward_earned`; the customer hears about it in their next WhatsApp order notification and sees it on the storefront.
3. On a later order, POS (phone lookup) or storefront shows the redeemable reward.
4. Applying it emits the attributed discount + `loyalty.reward_redeemed`; the counter resets by event.
5. *Merge case:* concurrent redemption attempts across devices resolve like Flow B step 5 — append, flag, never block.

**Flow D — Automatic deal on the storefront**
1. Customer opens the storefront during the deal window; deal-scoped items show the deal price.
2. Cart applies the discount automatically; the order goes through the normal doc 06 flow.
3. `discount.recorded` with `campaign_id` rides the order events; kitchen and POS see an ordinary discounted order.
4. Window ends → prices revert; an in-flight cart revalidates at submission, and whatever price is confirmed is snapshotted on the line (01-F18) — no post-hoc repricing.

**Flow E — Opt-out**
1. Customer replies "STOP" (or a recognized Urdu variant) to any message.
2. Doc 07 ingests it → `customer.opted_out` → registry updated.
3. Every subsequent segment evaluation and send-time check excludes the customer, effective < 1 min (17-N2).
4. Re-inclusion happens only on an explicit customer opt-in (`customer.opted_in`); no org-side path exists.

## 5. Data

- **Entities owned (cloud read models, rebuildable per 01-F7):** `campaigns`, `segment_definitions` (+ evaluation log), `coupon_codes` (+ per-code state), `loyalty_program` + `loyalty_progress`, `send_log`, `lift_reports`. The opt-out registry is owned by doc 07; this module is a consumer and never writes around it.
- **Events added to the 01 §4 catalog by this spec:** `campaign.created / activated / paused / completed`, `campaign.message_sent`, `campaign.message_status_ingested`, `customer.opted_out / opted_in`, `loyalty.reward_earned / reward_redeemed`.
- **Extended payloads:** `discount.recorded` + optional `campaign_id` (additive, 00 §6).
- **Events consumed:** listed in §2.
- **Retention:** send logs and evaluation logs kept ≥ 12 months for lift baselines and dispute resolution; message *content* is not stored beyond the template id + parameters (the customer's phone number is already org-scoped data, 00 §5.4).

## 6. Non-functional requirements

Cross-cutting NFRs inherited from 00 §5. Module-specific:

- 17-N1 Segment evaluation over 50k customers < 60 s.
- 17-N2 Opt-out effective (excluded from all sends) < 1 min after ingestion.
- 17-N3 Coupon validation at POS < 100 ms from local reference data (no network on the critical path).
- 17-N4 The send scheduler never exceeds metering caps or WhatsApp tier limits — property-tested (00 §4), not best-effort.
- 17-N5 Lift view cached load < 2 s (aligns with owner-dashboard target, 00 §5.3).
- 17-N6 Campaign/deal activation and deactivation propagate to storefront and POS via the reference channel < 1 min cloud-side; within a branch, the LAN fast path applies (00 §5.3).

## 7. Customizability

- **Layer 1 (platform admin):** module feature flag; per-org send metering caps; attribution-window bounds (org value must fall inside them).
- **Layer 2 (org):** campaign definitions; segment parameters within preset bounds (e.g. lapsed N ∈ 14–90 days); loyalty program parameters (N, reward); send windows; coupon constraints.
- **Layer 3 (branch/device):** none.
- **Deliberately not configurable:** opt-out honoring and its permanence; metering bypass; the attribution formula; segment types beyond the preset five; loyalty mechanics beyond order-count.

## 8. Tech notes

- Backend `marketing` module + BullMQ scheduled sends via the jobs service; segment evaluation is SQL over the customer/order read models — no data duplication.
- Campaign/coupon reference data distributes over the kernel reference channel (01 §8) so POS/storefront validation is local and offline-capable — one replication path, already tested.
- WhatsApp specifics (template approval, tier management, webhook handling) stay in doc 07; this module calls its internal tRPC surface and never talks to Meta directly.
- Lift computed nightly with on-demand refresh; reports carry their attribution rule text and input windows for doc 13 citation compatibility.
- Coupon checksum: single check character (Luhn-style over base32) — catches fat-finger entry at POS before any lookup.
- Status-webhook ingestion is idempotent (message id dedupe) and tolerant of out-of-order delivery, matching the kernel's soft-reference discipline (00 §6).

## 9. Open questions

1. SMS fallback for customers not on WhatsApp — worth the gateway cost, or storefront-only for them?
2. Attribution window default (7 days) — validate against pilot data before freezing.
3. Whether loyalty progress should print on receipts (doc 03 space/clutter trade-off) in addition to WhatsApp/storefront.
4. Multi-campaign overlap: "most recent qualifying campaign" is the draft dedupe rule — confirm it doesn't systematically flatter broadcasts over always-on deals.
5. Instagram/link-click tracking for storefront doors (lightweight UTM-style tagging) — useful lift signal or scope creep toward the excluded ad-platform territory?
