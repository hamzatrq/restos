# 06 — Hosted Storefront

**Module spec — Draft 1, July 2026** · Status: draft for review · Parent: `00-platform-overview.md` (conventions §5–§7 inherited), `01-kernel-sync.md` (ledger, catalog, customer file). Concept refs: v2 concept §4.2 (commerce core), design law 4 (one storefront, many doors). Wave 2.

## 1. Purpose & scope

The hosted storefront is the single customer-facing web surface for every own-channel door: QR-on-table dine-in, pickup, and delivery. One multi-tenant Next.js app serves every restaurant (subdomain per org, optional custom domain). Instagram is a door into it (link-in-bio/story links), WhatsApp hands conversations into it (doc 07) — neither gets a separate build. Used by customers on their own phones; no install. All tiers and profiles get it when the org enables own channels; QR dine-in requires no extra hardware beyond printed QR codes.

In scope: menu browsing, cart, checkout in three modes, customer identity capture, order status page, take-rate metering emission. Out of scope: aggregator channels (doc 08), WhatsApp conversation logic (doc 07), rider tracking UI beyond status states (doc 09), loyalty/promos (doc 17), card gateway implementation (interface only at launch).

| Mode | Entry | Identity gate | Lands as |
|---|---|---|---|
| QR dine-in | table QR (org+branch+table) | none required (06-F13) | branch queue order with table id |
| Pickup | link/subdomain → branch pick | OTP on first order | branch queue order + pickup code |
| Delivery | link/subdomain → branch pick | OTP on first order + address | branch queue order + dispatch pool (doc 09) |

## 2. Position in platform

- **Consumes:** catalog reference data + versions (01-F21), `availability.changed` fast-path (01-F22), order lifecycle events (`order.confirmed / rejected`, `order.line_state_changed`, `kot.printed`, `rider.picked_up / delivered`) for the status page, customer file reads (01-F23), branch sync-liveness signal (01-F11 exposed cloud-side).
- **Emits:** `order.created` (+ mode/source payload), `order.cancelled`, `customer.created / address_added / phone_verified`, `metering.usage_recorded`.
- **Depends on:** doc 01 cloud services (api-gateway, event store), doc 07 for WhatsApp OTP delivery, docs 02/03/05 downstream for fulfillment, doc 14 for org storefront settings, doc 15 for take-rate config and domain provisioning.
- **Extends 01 §4 catalog** (spec PR): `order.confirmed / rejected / cancelled`, `customer.phone_verified`, `metering.usage_recorded`.

## 3. Functional requirements

**Tenancy & routing**
- 06-F1 One deployment serves all orgs. Host-based tenant resolution: `{org-slug}.restos.pk` always works; an org may attach one custom domain (CNAME + automated TLS), provisioned via doc 15. Unknown host → neutral 404, never another org's data.
- 06-F2 Multi-branch orgs: pickup/delivery flows start with branch selection (list with hours + open/closed state); QR dine-in URLs pin the branch. The chosen branch scopes menu, availability, and the order's `branch_id`.
- 06-F3 English-only UI (00 §5.6); Western numerals, PKR formatting.

**Menu & availability**
- 06-F4 The menu mirrors the org catalog (categories, items, variants, modifier groups, prices, photos) rendered from the current catalog snapshot version. A catalog publish (doc 14) invalidates the rendered menu within 60 s.
- 06-F5 Items toggled unavailable (01-F22) are hidden from the menu within 5 s of the availability event reaching the cloud. Items in an open cart that become unavailable are flagged in the cart and block checkout until removed.
- 06-F6 Prices shown are the catalog prices for the selected branch; the price snapshotted on `order.created` lines is the price shown at add-to-cart time (01-F18).

**Modes (the three doors)**
- 06-F7 **QR dine-in:** each table gets a printed QR encoding org + branch + table id (generated in doc 14). Scanning lands on the branch menu in dine-in mode; the placed order carries the table identity and enters the branch queue exactly like a waiter-entered order (surfaces on POS/pass per docs 02/03 with channel badge).
- 06-F8 **Pickup:** customer selects branch, orders, receives a pickup code (short human-readable, printed on the KOT); status page shows "ready" state for collection.
- 06-F9 **Delivery:** address capture — free-text address + area/locality picker + optional map pin; saved to the org customer file via `customer.address_added`; returning verified customers pick from saved addresses. Delivery fee and minimum order value per branch config are applied and shown before checkout.
- 06-F10 Every order records `source` attribution in its payload: `direct | qr | instagram | whatsapp` (from the entry link, e.g. `?src=instagram`), distinct from mode. Channel for all storefront orders is `storefront`; docs 12/13 report on mode × source.

**Customer identity & OTP**
- 06-F11 Checkout captures a phone number (normalized E.164) and writes to the org customer file (01-F23): `customer.created` on first sight, name/address attach on subsequent orders. Org-scoped absolutely (00 §5.4).
- 06-F12 First pickup/delivery order from a phone number requires OTP verification (`customer.phone_verified`). **Decision:** OTP is delivered via WhatsApp (doc 07 authentication template) when the org has the WhatsApp channel enabled, with SMS fallback if undelivered within 30 s or the org lacks WhatsApp. Rationale: WhatsApp delivery rates in Pakistan beat SMS, cost is lower, and it verifies the same identity doc 07 will notify. Verified state persists per browser (signed session cookie) and per customer record.
- 06-F13 QR dine-in orders do not require OTP (physical presence at the table is the anchor); phone capture is still requested and may be skipped — org-configurable (layer 2) to require it.
- 06-F14 Links handed off from WhatsApp (doc 07) carry a signed short-lived token binding the verified WhatsApp phone; the storefront skips OTP and pre-fills identity for those sessions.

**Payments**
- 06-F15 Launch payment options: cash on delivery / cash at counter (dine-in, pickup), and RAAST/bank-transfer reference flow: storefront shows the branch's configured account details, customer submits their transfer reference string, and the order carries `payment_intent: { method: 'raast_transfer', reference }`. Actual `payment.recorded` is emitted by the branch (doc 02) at settlement after the manager/cashier verifies receipt — the storefront never asserts payment success it cannot verify.
- 06-F16 Card payments sit behind a `PaymentGatewayProvider` interface (create intent, confirm, webhook verify, refund) with no live implementation at launch; enabling a gateway later must not change checkout flow structure or order events.

**Order lifecycle & honesty (00 §5.1)**
- 06-F17a **Confirm policy (canonical for all storefront-door orders, including WhatsApp/Instagram handoffs):** a cloud order is confirmed by an explicit **counter accept on POS** (notification + one-tap accept, doc 02) emitting `order.confirmed`; layer-2 config may enable **auto-accept** during open hours (immediately or after N minutes unattended). KOT prints only after `order.confirmed` (03) — never before, on any path.
- 06-F17 Placing an order persists `order.created` cloud-side and enqueues it for the branch. The confirmation screen and status page show, truthfully:
  - **received** — the cloud has the order (this is all "order placed" ever claims);
  - **confirmed** — the branch emitted `order.confirmed` (with ETA if provided);
  - **preparing** — first `kot.printed` or any line `in_prep` (display label, not a state — 01 §4);
  - **ready** — all lines ready (pickup/dine-in terminal-facing state);
  - **dispatched** — `rider.picked_up` (delivery), then **delivered** on `rider.delivered`.
- 06-F18 If the branch's last sync contact exceeds a staleness threshold (default 120 s), the customer sees "the restaurant hasn't seen your order yet — it is queued and will reach them the moment they're back online", with the option to cancel. Stale is never shown as confirmed.
- 06-F19 The customer may cancel (`order.cancelled`) any time before `order.confirmed`; after confirmation, cancellation is a phone call to the branch (number shown), and any void follows branch approval rules (docs 02/05).
- 06-F20 The branch may reject a queued order (`order.rejected`, reason: closed, item unavailable, out of delivery range); the status page states the reason plainly. If no confirmation arrives within an org-configured window (default 10 min), the customer is told and offered cancel — the order is never silently abandoned.
- 06-F21 The status page updates in real time (WebSocket/SSE) and shows last-updated age when the stream drops (00 §5.7).

**Metering**
- 06-F22 On every storefront-placed `order.created`, the service emits `metering.usage_recorded` `{ kind: 'own_channel_order', order_id, order_value_paisas, rate_bps, fee_paisas }`. `rate_bps` is read from the org's platform-admin metering config (set in doc 15; this doc never exposes the setting). Exactly one metering event per order (idempotent on order id); `order.rejected / cancelled` produce a linked reversal metering event.

**Anti-abuse (basics)**
- 06-F23 Rate limits: per-IP request throttling; per-phone OTP issuance ≤ 3/hour and ≤ 6/day; per-phone order placement ≤ 5/hour (limits are platform defaults, doc 15 adjustable).
- 06-F24 Org-level customer flags: a customer file marked `cod_blocked` (set from POS/back office after no-shows) cannot place COD delivery orders — storefront offers RAAST-reference prepayment instead. First-order COD value cap per org config (layer 2, default off).

**Backpressure & unconfirmed-order hygiene (Wave 2 — channel pulse arrives Wave 4)**
- 06-F27 Per-branch cap on unconfirmed cloud orders (default 10, doc 15 adjustable): beyond it, the storefront pauses intake with an honest "restaurant is at capacity — try again shortly." An order unconfirmed past the 06-F20 window auto-closes (`order.cancelled`, customer notified) — never lingers. Auto-accept (06-F17a) suspends while the branch is sync-stale (06-F18) or the unconfirmed queue exceeds the cap — auto-accept must never fire into a branch that isn't seeing orders. On reconnect, queued orders drain oldest-first with availability re-validated before confirm; items gone unavailable route through the 02-F9 line-resolution path.

**QR dine-in settlement handoff (canonical — closes the eat-and-leave gap)**
- 06-F28 Per-org QR settlement policy (layer 2), one of:
  - **Pay-at-counter (default):** the status page shows "pay at the counter when you're done" throughout; a "request bill" tap raises an S2 prompt on the POS with table id (21 interrupt law); settlement at the counter (02) settles the order and releases the table.
  - **Prepay:** RAAST-reference/card (when available) before the order enters the queue — cloud-kitchen/QSR profiles.
  - **Waiter handoff (T3):** the bill request routes to the table's waiter (04), who closes out per the normal table flow.
  In every mode: who settles and who releases the table is explicit above; an unsettled QR table stays visible in the POS open-orders view — walk-out exposure is always on a screen, never silent.
- 06-F25 Each org storefront exposes correct per-org metadata: page titles, OpenGraph tags, and a share preview (logo + name) so links shared on WhatsApp/Instagram render as the restaurant, not the platform. Search indexing is on for the menu landing page, off for cart/checkout/status URLs.
- 06-F26 A hosted order summary is viewable from the status page after completion (items, totals, payment method stated as recorded); it mirrors branch receipt data but is not a fiscal receipt — the printed receipt (docs 02/16) remains authoritative.

## 4. Key flows

**QR dine-in (happy path)**
1. Customer scans the table QR → branch menu opens in dine-in mode, table pinned.
2. Builds cart; confirms; phone optionally captured (06-F13).
3. `order.created` persisted (channel storefront, mode qr_dinein, table id) → branch queue.
4. POS cloud-order inbox accepts it (02-F9; or org auto-accept, 06-F17a) → `order.confirmed` → KOT prints; status page tracks received → confirmed → preparing → ready → served → bill requested → settled (06-F28).
Failure path: branch offline → 06-F18 honesty state on the customer's phone; staff at the physical table remain the fallback; order enters the queue on reconnect.

**Pickup (happy path)**
1. Customer opens the storefront (direct or Instagram link) → picks the branch (06-F2).
2. Cart → phone → OTP if first order (06-F12) → payment: cash at counter.
3. `order.created` (mode pickup) → branch confirms with ETA → preparing.
4. All lines ready → status page shows **ready** + the pickup code; the same code is on the KOT so counter handover is a code match, not a name shout.
5. Customer collects; cashier settles at counter → `payment.recorded` (doc 02).

**Delivery with RAAST reference**
1. Menu → cart → phone number → OTP (WhatsApp, SMS fallback, 06-F12).
2. Address entered, saved to customer file (`customer.address_added`); delivery fee + minimum shown.
3. Payment: RAAST selected → account details shown → customer transfers → enters reference → places order.
4. Status: received → branch confirms with ETA → preparing → `rider.picked_up` (dispatched) → `rider.delivered`.
5. At branch settlement the manager verifies the transfer against the reference and emits `payment.recorded` (doc 02).
Failure path: reference never verifies → branch calls the customer; order settles as COD or is voided under approval rules — the ledger records what actually happened.

**Branch-offline placement (00 §5.1 proof case)**
1. Order placed 21:04; branch connectivity is down.
2. Status page shows the queued-honestly state (06-F18) within the 120 s threshold; cancel stays available.
3. Branch reconnects 21:11 → order enters queue → branch confirms → customer sees confirmed at 21:12, with the gap never disguised.
4. Variant: customer cancelled at 21:09 → branch sees the order already-cancelled on arrival; it never reaches the kitchen.

**Availability race**
1. Item 86'd while sitting in a customer's cart → cart line flagged within 5 s (06-F5); checkout blocked until removed.
2. A placed-but-unconfirmed order containing a newly-86'd item is the branch's call: confirm partially after phoning the customer, or `order.rejected` with reason `item_unavailable`.

## 5. Data

- **Owned (cloud Postgres, module tables + read models):**
  - `storefront_settings` per org/branch — modes enabled, delivery fee/minimum, RAAST account details, brand assets, confirmation window.
  - `carts` — server-side, session-keyed, TTL-expired; never kernel events (a cart is not a fact).
  - `otp_verifications` — phone, channel used, attempts, outcome.
  - `qr_table_links` — org/branch/table → static URL token.
  - `custom_domains` — domain, TLS state, org binding.
  - Order-status read model — projection of kernel events powering the status page; rebuildable (01-F7).
- **Events emitted:** `order.created`, `order.cancelled`, `customer.created / address_added / phone_verified`, `metering.usage_recorded`.
- **Events consumed:** `availability.changed`, `order.confirmed / rejected / line_state_changed`, `kot.printed`, `rider.picked_up / delivered`, catalog/config version events.

## 6. Non-functional requirements (module-specific)

- 06-N1 Menu page LCP < 2.5 s on a mid-range Android over 4G; JS payload for menu + cart < 200 KB gzipped.
- 06-N2 Status page reflects a kernel state change < 3 s after the event reaches the cloud.
- 06-N3 Availability hide (06-F5) and catalog invalidation (06-F4) meet their stated latencies under 200-branch load (01-N4 conditions).
- 06-N4 Tenant isolation is testable: automated cross-tenant probes (host header manipulation, id guessing, signed-token replay across orgs) return zero foreign-org data.
- 06-N5 The storefront degrades read-only if the event store is unavailable: menu still renders from cache; checkout disabled with an honest message — never a fake success.
- 06-N6 QR URLs are static and stateless: a laminated table card printed at onboarding works for the life of the table mapping without reprint.

## 7. Customizability

- **Layer 1 (platform admin, doc 15):** take-rate `rate_bps` per org, custom domain enablement, anti-abuse limit overrides.
- **Layer 2 (org, doc 14):** modes enabled per branch, delivery fee + minimum order, RAAST/bank account details, brand logo/color/photos, dine-in phone-required toggle, confirmation-window minutes, first-order COD cap.
- **Layer 3 (branch/device):** none — this is a cloud surface.
- **Deliberately not configurable:** checkout step structure, honesty states (06-F18 cannot be disabled and its threshold has a platform floor), metering emission, OTP requirement for delivery/pickup first orders, one-customer-file-per-phone rule.

## 8. Tech notes

- Next.js (00 §3) on the shared cloud; host-middleware tenant resolution; menu pages ISR-cached keyed on `(org, branch, catalog_version, lang)` — availability overlays applied client-side from the realtime channel so a 86 never waits on page revalidation.
- Status page realtime via the existing sync-gateway WebSocket fan-out with a read-only, order-scoped signed token; customers are not kernel devices — the storefront service holds a single cloud device identity per 00 §6 envelope and emits on customers' behalf.
- OTP handoff to doc 07 via internal tRPC; SMS fallback behind an `SmsProvider` interface (local gateway vendor chosen at build time).
- Cart state lives server-side keyed by session cookie — survives page reloads on flaky connections; the automation law is respected because the cart is not a fact, only `order.created` is.
- Take-rate reversal events (06-F22) keep doc 15's metering rollup a pure fold over `metering.usage_recorded` — no cross-module reconciliation queries.
- Playwright covers the three mode flows including the offline-honesty states (00 §4 testing standard); a stubbed branch-liveness API drives the staleness cases deterministically.

## 9. Open questions

1. Delivery-zone geometry: launch uses area picker + branch judgment on reject; polygon zones with auto-fee tiers — build-time decision when a pilot needs it.
2. Auto branch routing for delivery in multi-branch orgs (nearest-branch by area) vs customer choice — customer choice at launch; revisit alongside call-center routing (doc 02).
3. Card gateway selection for the first `PaymentGatewayProvider` implementation — candidates re-evaluated at build time; the interface is already fixed by 06-F16.
4. Whether pickup ETA quotes come from the timing pipeline (doc 03 learned ETAs) at Wave 2 or stay branch-manual until pipeline confidence — bias: manual until doc 03 quotes are trusted.
5. Guest order-status access longevity: status links are signed URLs; retention of customer-visible order history beyond 30 days TBD with doc 17 loyalty needs.
6. RAAST payment confirmation automation (bank-side webhook/API instead of manual verification) — no reliable consumer-facing rail today; re-evaluate when one exists, without changing 06-F15's event shape.
