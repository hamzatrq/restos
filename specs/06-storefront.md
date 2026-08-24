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

**The cloud origin (August 2026 — the plane decision, and it is a constraint rather than a preference)**
- 06-F30 **THE STOREFRONT SERVICE IS A REGISTERED DEVICE, ONE PER (org, branch), AND IT APPENDS `order.created` ITSELF.** A customer's browser is not a device: it holds no `01-F47` token, has no branch clock, has no `actor_user_id`, and `01-F62` requires all three to be stamped **at append by an originating device**. **A browser cannot append.** That is the same wall `05-F28` measured for the manager console, and this FR walks around it rather than through it.
  - **⚠ THIS IS NOT `05-F29`'s REJECTED OPTION (b), AND THE DISTINCTION IS THE WHOLE FR.** Option (b) amended `01-F62` so a **cloud user's** decision had a legal envelope, which dissolves the FR's own discriminant. **`01-F62` is UNAMENDED here.** Its test is *"an event type is org-scoped when its only legitimate emitter is the cloud plane"*, and `order.created`'s legitimate emitters include every till in the country — so it was always branch-scoped, and it stays branch-scoped. The emitter is a **device**, which happens to live in a data centre. What was missing was never a scope; it was a device. A reader who finds this FR and concludes the wall was broken has read it backwards, and `01-F39`'s `storefront_cloud` clause says so at the other end.
  - **The measured argument that decides it, and it is the shipped counter rather than an aesthetic.** `02-F9`'s inbox reads its candidates from `store.openOrders()` — the till's fold of its **branch stream** (`apps/pos-electron/src/renderer/OrdersSurface.tsx`, `isCloudInbox`). An order can only appear there if it is already in that stream, so **the shipped inbox cannot see an order that lives only in a cloud table**. `00 §5.1` says it in the platform's own words: cloud-originated orders *"queue for the branch and enter the moment connectivity returns"*. The till-originates alternative was refused for a stated cost: a customer cancelling before accept would be cancelling something that was never in the ledger, so `06-F19` and `06-F27` would lose their producers again and `01-F84`'s owed half would stay owed.
  - **What it costs, stated rather than discovered.** A branch's ledger acquires an origin the branch cannot see, power-cycle or walk to. `01-F64`'s store binding, `01-F66`'s single-instance lock and `01-F72`'s LAN PKI are all device-shaped protections that do not reach it, so it needs its own: **exactly one writer per (org, branch)**, enforced by a Postgres advisory lock held for the life of the append, because two storefront processes sharing one lamport counter is `01-F66`'s defect in a data centre. The origin holds **no branch slice**: it appends and pushes, and it never folds a branch stream.
- 06-F31 **THE CLOUD ORIGIN'S CLOCK IS PERMANENTLY `branch_provisional`, AND NO FOLD MAY PREFER IT.** `01-F43` frames offset-0 as the transient state of a device *"with no hub contact yet"*; a cloud origin never acquires an offset because it never contacts a branch hub, so its `time_basis` is `branch_provisional` **for ever** and this FR is what makes that a sanctioned state rather than a permanent anomaly. `01-F45`'s basis precedence already does the work: where a fold selects among competing time-carrying members, `branch` members are preferred and a provisional one is used **only when no `branch` member exists**. Every duration this product computes anchors on `order.confirmed` (`03-F25`), which the **till** emits with `branch` basis — so the cloud stamp is never the value a timer reads.
  - **⚠ THE EXCEPTION, WHICH IS REAL AND IS THE HONEST HALF: an order that is never confirmed has NO `branch` member at all.** Its whole life — `order.created`, its lines, and a `06-F27` auto-close — is provisional, so any age computed for it is computed on a cloud clock. That is acceptable **only** because the cloud clock is the one clock in this system that is not a threat (`01-F62` makes exactly this argument for `server_received_at`), and because the affected quantity is the storefront's own backpressure and auto-close arithmetic, never a kitchen or service duration. **`06-F18`'s staleness and `06-F27`'s window are therefore cloud-side computations and are specified as such**; a device must not derive them.
  - **⚠ AND THE INBOX CANNOT ORDER ITSELF, WHICH SHIPPING THIS MODULE MAKES VISIBLE FOR THE FIRST TIME.** `06-F27` requires queued orders to *"drain oldest-first"*, and `27-F7` requires a list's visual order to be its work order. Measured August 2026: `sync-client`'s `open_orders` projection (`OpenOrderRow`) carries `confirmed_at` and **no created-at**, and `OrdersSurface.tsx` accordingly filters the inbox without sorting it, recording in shipped prose that the inbox's work order *"is arrival order — which this device cannot know"*. Today that is invisible because the inbox is always empty in production; **this module is what fills it.** The projection field is a `packages/sync-client` act, is **owed**, and is the gating dependency for both `06-F27`'s drain order and `02-F9`'s *"unaccepted past half its confirmation window"* escalation. Until it lands the inbox is honest but unordered, and no surface may claim oldest-first.
- 06-F32 **A PUBLIC CUSTOMER SURFACE IS NEITHER OF COMMANDMENT 5's TWO PLANES, AND THE GATE IS ENTITLEMENT RATHER THAN `can()`.** `18 §6` puts this module on the cloud plane, whose data layer is tRPC + TanStack Query; but the cloud plane's gate assumes an authenticated subject with a role, and a customer has neither — `ROLES` has four members, a customer is none of them and must never become one. `services/api` additionally holds its public-procedure set at exactly one — the login procedure — behind a boot assertion and a tripwire test, and widening it is not on the table.
  - **The resolution: a separate service, `services/storefront`, with its own tRPC router and its own boot assertion**, keeping `18 §6`'s data layer and leaving `services/api`'s public set at one. Its gate is **two mechanisms and not one**, and `28-F4` is explicit that collapsing them is wrong: **(i) at BOOT, every storefront procedure either DECLARES a capability or appears on a named exemption list**, the same shape as `assertEveryProcedureIsGated`; **(ii) at RUNTIME, `entitled(org, capability)` is resolved per request from the org's `28-F6` record.** ⚠ `28-F4`'s closing bullet retires the tempting one-line version in terms — *"'an ungated or unentitled procedure is a boot failure' is therefore wrong … what boot can see is a missing declaration"* — because entitlement is a per-org runtime fact (`28-F5`) and a boot check has no org to resolve against. A design that says only *"declares the capability it is gated on, and the server refuses to boot otherwise"* reads as one mechanism and would ship the declaration without the resolution: every procedure correctly labelled, and no tenant's entitlement ever actually checked. **The capability vocabulary is `15-F5`'s and nothing else** (`28-F4`): this module declares the **storefront cloud channel flag** `28-F6` already carries, and mints no per-procedure key. This is not an invention: `28-F4` rules entitlement *"composes with `can()`; it is not an action in `PERMISSION_ACTIONS`"*, and `28-F6` puts a storefront flag in the entitlement record while requiring the gate to land **with its first capability consumer, never before**. This module is that consumer. So commandment 8 is satisfied without minting a permission action (a doc-14 act under `14-F30`) and without a `customer` role. The org is resolved from the host (`06-F1`), so unlike `28-F4`'s login there **is** a subject org and entitlement is structurally possible.
  - ⚠ **`18 §6` is owed a clause naming this**, either as a third plane or as an explicit statement that a public no-subject surface sits on the cloud plane with an entitlement gate. Until it lands, this FR is the only place the arrangement is written down, and a session reading `18 §6` alone will find two planes and no home for this one.
- 06-F33 **THE PRICE ON A STOREFRONT LINE IS RESOLVED BY THE ORIGIN FROM THE PUBLISHED CATALOG, AND THE REQUEST CARRIES NO PRICE FIELD AT ALL (August 2026, adversarial review).** `06-F6` binds the written price to the catalog and `01-F60` keys it per `(branch, channel)` with no fallback; `02-F42` makes `storefront` one of the five channels. The first implementation of `06-F30` took `unit_price_paisa` from the **public, unauthenticated request body** and wrote it into `order.line_added` verbatim, reading no catalog anywhere: a Rs 450 burger was reproduced arriving in a cashier's `02-F9` inbox at **1 paisa**, and her only inbox action is Accept, which `01-F1` makes permanent. So this FR states the property the older FRs assumed.
  - **Unrepresentable, not validated.** The cart line a customer posts is `{line_id, item_id, qty}` and there is no price field on it to check — a field that can be sent and is then compared is a field a later session trusts. The origin resolves `(this origin's branch, storefront, item_id)` against the published catalog artifact, exactly as a till resolves its own branch's cell at line-add (`01-F53`, `01-F18`: captured once, never re-derived afterwards).
  - **One catalog version per order.** Every line of one cart prices against a single published version, so a publish landing mid-cart cannot price half an order against each menu. The version is **not** written into the payload — `01 §4`'s payload set is closed and adding an artifact version to it is a doc-01 act (`§9`'s open question 3), not a quiet addition.
  - **An unpriced item is REFUSED, and that is not an `01-F17` breach.** `01-F60` admits no fallback and inventing a price is worse than refusing; the refusal names the items. `01-F17` forbids blocking a **sale** — one unsellable item is refused while the rest of the order is not, which is the rule `addLine` already follows on the counter.
  - **⚠ THE RESIDUAL, STATED RATHER THAN CLOSED: `06-F6` says the price is the one shown at add-to-cart, and this FR resolves it at APPEND.** The two differ only for a cart held across a publish, and closing that gap needs the customer surface `06-F5` describes — a cart flagged and re-priced before checkout — which does not exist (`apps/storefront` is a stub). Until it does, the origin writes the price the catalog holds when the order is placed, which is the one the branch can honour. **What is refused in the meantime is the shortcut**: a price travelling from the browser so the two can never disagree.
- 06-F34 **THE TENANT THE GATE RESOLVES AND THE TENANT THE ENVELOPE CARRIES ARE ONE VALUE, AND A HOST THAT IS NOT THIS ORIGIN'S IS A NEUTRAL 404 (August 2026, adversarial review).** `06-F1` resolves the tenant from the host and `06-F30` fixes one origin per `(org, branch)` from deployment configuration. The first implementation held both: the router was multi-tenant (an org on the request context) and the origin was single-tenant (its own identity), **nothing compared them**, and entitlement was reproduced passing for one org while the events landed in another's ledger.
  - **(a) The process serves exactly one org.** `createContext` resolves the request's `Host` and admits it only when it is the host this origin was configured for; anything else is a neutral 404 that names nothing (`06-F1`), and no request can select a tenant.
  - **(b) The write refuses a mismatch by name.** `place`/`cancel` compare the resolved org against the origin's own identity **before** anything is appended, and refuse with a named error rather than a generic one, so the isolation failure is not read as a commercial refusal (`28-F4`) or as a bad request. Defence in depth: (a) makes the mismatch unreachable through the shipped host, (b) is what holds when a later session adds a second entry point.
  - **(c) The residual is `28-F20`'s, not this module's invention.** A per-process tenant axis is exactly the gap `28-F20` measures on `services/api`, and it is inherited here: the day one deployment serves many orgs, (a) becomes a directory read and (b) becomes the check that catches the day it is wrong. `28-F5` (a) is not breached by (a) — a *host binding* is `00 §7` layer-3 deployment configuration of this process, the same clause `01-F65` uses for a device's own identity — but it is the line to re-read when this stops being one origin per process.
- 06-F29 **Customer surfaces are governed by their own law, not by `21 §5` (gap G8, founder ruling July 2026).** `21 §5` claims to cover every screen, but its role laws optimise for an **expert operator, trained, on known hardware, repeating a task hundreds of times a shift**. A customer is the opposite on every axis: untrained, one-time, on their own unknown phone, with no incentive to learn anything. Stretching the staff law over that problem would import the wrong defaults — density tuned for experts, a closed vocabulary sized for a 15.6″ terminal, and budgets derived from repetition. **This module and `07` own the customer law.** Two things do carry across unchanged, because they are about the population rather than the posture: `27-F22`/`27-F23` (Western digits, `Rs` symbol-first, no operational decimals) and `27-F24` (the system computes; nobody does mental arithmetic). Touch minimums follow `27-F8`'s handheld row as a **floor**, not a target — a customer holds their phone one-handed like a waiter does.

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
- Status page realtime via the existing sync-gateway WebSocket fan-out with a read-only, order-scoped signed token; customers are not kernel devices — the storefront service holds a single cloud device identity per 00 §6 envelope and emits on customers' behalf. ⚠ **THIS NOTE PREDATES THE FR THAT NOW GOVERNS IT, AND THE TENSION WAS UNMARKED FOR A MONTH.** This doc is Draft 1, **July 2026**; `01-F62` is **August 2026** and requires `branch_id` + `branch_created_at` + `time_basis` on every branch-scoped envelope, *stamped at append by an originating device*. *"A single cloud device identity"* is under-specified in exactly the three ways `01-F62` makes load-bearing: one identity per what (the envelope needs a `branch_id`), under which `01-F39` class (`registerDevice` refuses an unknown one), and with which `branch_created_at` (a cloud origin has no hub). **`06-F30` decides all three and this note is subordinate to it**: the identity is per **(org, branch)**, its class is `storefront_cloud`, and `06-F31` governs its clock. The note is otherwise correct and is the answer `06-F30` ratifies — recorded here because a July premise left unmarked beside an August FR is read forward as if it had been checked against it.
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
