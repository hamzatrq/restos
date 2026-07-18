# 07 — WhatsApp Channel Service

**Module spec — Draft 1, July 2026** · Status: draft for review · Parent: `00-platform-overview.md` (conventions §5–§7 inherited), `01-kernel-sync.md`. Concept refs: v2 concept §4.2 (WhatsApp door), §4.6 (analyst surfaces), §9 risk 1. Wave 2 (functions 1–3); function 4 lands with doc 13 in Wave 4.

## 1. Purpose & scope

One cloud service on the WhatsApp Business Cloud API carrying four functions per org:

1. **Ordering door** — conversations that hand off into the storefront (doc 06) with verified identity, plus quick-reply reorder of past orders.
2. **Transactional notifications** — order confirmed/ready/dispatched via pre-approved templates, opt-in managed.
3. **Support rail** — customer messages routed to restaurant surfaces (docs 02/05) with basic auto-replies (hours, menu link, order status).
4. **Owner analyst surface** — transport, identity, and session contract for the conversational analyst whose brains live in doc 13. This doc specifies zero AI behavior.

Plus the machinery all four need: template lifecycle management, 24-hour messaging-window rules, opt-in/opt-out compliance, and per-org message metering.

Used by: customers (their own WhatsApp), restaurant staff (support surfaces in docs 02/05), owners (analyst). Runs as `services/whatsapp`; no on-device component.

## 2. Position in platform

- **Consumes:** `order.created / confirmed / rejected / line_state_changed`, `kot.printed`, `rider.picked_up / delivered` (notification triggers); customer file reads (01-F23); org channel config (doc 14); metering config (doc 15); analyst API (doc 13).
- **Emits:** `whatsapp.inbound_received / outbound_sent / outbound_failed / template_status_changed / optin_recorded / optout_recorded`, `customer.created / phone_verified`, `order.created` (reorder confirms), `metering.usage_recorded` (kind `whatsapp_message`).
- **Depends on:** Meta WhatsApp Business Cloud API + webhooks; BullMQ (00 §3) for outbound; doc 06 for checkout handoff; doc 15 for WABA provisioning tooling.
- **Extends 01 §4 catalog** (spec PR): the `whatsapp.*` family above; reuses `metering.usage_recorded` defined in doc 06.

## 3. Functional requirements

**Number & account strategy**
- 07-F1 Each org gets its **own WABA and its own dedicated number** — never a shared multi-tenant number. Rationale: per-org quality rating and messaging-tier isolation (one org's behavior cannot throttle another), unambiguous inbound routing, and the org owns the asset. Options analyzed:
  - (a) *Org's existing number* migrated to the Cloud API — customers already know it, but the number leaves the WhatsApp/Business phone apps entirely (the owner loses app chat; every conversation must flow through RestOS surfaces), and porting friction is real.
  - (b) *Platform-provisioned new number* under the org's WABA — zero disruption to the owner's existing number; onboarding in hours; the new number is printed on receipts, QR cards, and the storefront so it becomes known fast.
  - (c) *Shared platform number* across orgs — rejected outright: identity confusion, routing ambiguity, and one org's spam poisons every org's quality rating.
  - **Recommendation: (b) is the default at onboarding; (a) offered when the number is the brand and the org accepts the migration consequences in writing.** Provisioning and embedded signup live in doc 15 tooling.
- 07-F2 Display name, profile photo, and business profile per org are set at onboarding (doc 15) and editable in back office (doc 14) within Meta approval rules.

**Function 1 — ordering door**
- 07-F3 Any inbound message from an unknown intent gets the ordering entry: a reply with the menu link — a signed short-lived storefront URL binding `{org, branch?, phone, conversation_id}` so doc 06 skips OTP (06-F14) and attributes `source: whatsapp`.
- 07-F4 Reorder quick-reply: customers with order history receive an interactive list of their last 3 orders (from the customer file) — selecting one shows the itemized cart + total as a message; confirming emits `order.created` directly (channel `whatsapp`), which then follows the standard cloud-order lifecycle including 00 §5.1 queue honesty. Reorder uses current catalog prices, stated in the confirmation message; 86'd items are dropped from the proposal and named.
- 07-F5 Orders placed in-conversation (07-F4) emit `metering.usage_recorded` `{ kind: 'own_channel_order', … }` exactly as 06-F22 — once per order, idempotent on order id. Storefront-checkout orders that started from a WhatsApp link are metered by doc 06; the shared idempotency key (order id) makes double-counting structurally impossible.

**Function 2 — transactional notifications**
- 07-F6 On `order.confirmed` (with ETA if present), all-lines-ready, and `rider.picked_up` for the customer's order, the service sends the matching pre-approved English template (07-F21). Delivered orders get a closing message. Triggers are kernel events only — no notification without a ledger fact (automation law, 00 §5.8).
- 07-F7 Notifications require opt-in: recorded (`whatsapp.optin_recorded`) at first order per org — checkout checkbox (doc 06) or in-conversation consent. No opt-in, no proactive message, ever.
- 07-F8 Template messages are sent only when the 24 h customer-service window is closed; inside an open window, free-form session messages are used (cheaper, no template constraints). Window state is tracked per (org number, customer) from the last inbound timestamp.

**Function 3 — support rail**
- 07-F9 Free-text inbound that isn't an order/analyst intent is a support message: persisted (`whatsapp.inbound_received`), routed to the org's configured support surface — POS counter (doc 02) and/or manager console (doc 05) — which display and reply through this service. Staff replies go out as session messages (window permitting), attributed to the staff user in the outbound event.
- 07-F10 Basic auto-replies answer without staff: opening hours, menu link, branch location, and "where is my order" (status lookup over the customer's open orders, answered from the same read model as doc 06's status page, including the branch-offline honesty state). Auto-reply intents are a fixed set; matching is keyword + button driven, not free AI.
- 07-F11 Unanswered support messages older than an org-configured threshold (default 10 min) raise a manager-console alert (doc 05).

**Function 4 — owner analyst transport (contract with doc 13)**
- 07-F12 Owner/manager phone numbers are registered and verified in back office (doc 14: existing user account + role + OTP proof of number possession). Inbound from a verified analyst number routes to analyst mode by default; a persistent menu escape ("support") reaches functions 1–3.
- 07-F13 Transport contract: this service passes `{ org_id, user_id, role, conversation_id, locale, message_text }` to doc 13 and renders the returned answer segments to WhatsApp messages (chunked ≤ 4096 chars, citations formatted as footnote lines). It never generates, filters, or rephrases analyst content. Doc 13 owns answer semantics, guardrails, and "not enough data" honesty.
- 07-F14 Analyst sessions ride the 24 h window (owner-initiated, so session messaging applies); doc-13-initiated pushes (nightly brief) use pre-approved utility templates to the same verified numbers.
- 07-F15 Analyst access is role-checked server-side per message (00 §5.4); a number removed from verification loses analyst routing on the next message, not the next session.

**Template lifecycle**
- 07-F16 A platform-standard template library — `order_confirmed`, `order_ready`, `order_dispatched`, `order_delivered`, `otp_code`, `reorder_prompt`, `nightly_brief`, `marketing_*` (reserved for doc 17) — is maintained centrally in English (00 §5.6) and instantiated per org WABA with brand tokens at onboarding. Per-org custom templates are not offered at launch.
- 07-F17 Template states (submitted / approved / rejected / paused / disabled by Meta) are tracked from webhooks as `whatsapp.template_status_changed`. A template becoming unusable triggers: fallback to an approved alternate if defined; else suppression of that notification class plus a fleet-health alert (doc 15) and an org-visible degradation notice (doc 14). The service never silently drops sends.

**Compliance & metering**
- 07-F18 Opt-out: "STOP"/"بند" keywords and Meta-level block events are honored immediately (`whatsapp.optout_recorded`); the per-org suppression list gates every outbound path including doc 17 broadcasts. Opt-out state is org-scoped and surfaced on the customer file.
- 07-F19 Every outbound send emits `metering.usage_recorded` `{ kind: 'whatsapp_message', class: authentication | utility | marketing | service, template_id?, conversation_id, org_id }` for platform metering visibility (rates and rollup owned by doc 15).
- 07-F20 Webhook ingestion is idempotent on Meta message id; all inbound/outbound/status events land in the kernel ledger so the conversation trail is auditable and org-scoped (00 §5.4 — numbers never cross orgs).
- 07-F21 All outbound templates are English (00 §5.6) — one template set per org, no per-conversation language selection. Inbound customer text is uncontrolled and handled as-is (e.g., opt-out recognition, doc 17).

**Language & voice (customer conversational layer — founder decision, July 2026)**
- 07-F22 **Input understanding is multilingual; output is English.** The intent router/LLM layer understands English, roman-Urdu, and mixed-code input (understanding roman-Urdu is tractable today; generating it accurately is not). All bot replies are English at launch. Understanding is broad, action is narrow: free text maps only onto the defined intent classes (order entry, status, support, opt-out, analyst for verified owners) — never free-form action.
- 07-F23 **Bilingual output is a planned later stage, deliberately deferred and eval-gated.** Current LLM roman-Urdu generation is unreliable; a roman-Urdu reply mode ships only when a native-speaker-scored golden reply set passes an agreed accuracy bar (evals run through the doc 13 LLM gateway). It never ships silently; until then, English replies to roman-Urdu input are the designed behavior, not a gap.
- 07-F24 **Voice notes are first-class input** (customers routinely send audio). Staged pipeline: (a) Wave 2 — inbound audio is persisted (org-scoped object storage), acknowledged, and routed to the support surface (05-F22) with inline playback; routing NEVER waits on transcription. (b) Transcription via an `SttProvider` interface (provider chosen at build time; the selection criterion is spoken Urdu/Punjabi/mixed-code accuracy) feeds the transcript into the same intent router as typed text — including the owner analyst surface (doc 13) at Wave 4. Low-confidence transcripts never trigger automated action; they fall through to human support with the audio attached. Original audio is always retained and staff-playable.
- 07-F25 The bot never replies with generated audio (no TTS at launch); replies are English text. Staff support replies are text, attributed per 07-F9.

## 4. Key flows

**Order via WhatsApp (happy path)**
1. Customer messages "menu" → intent router matches ordering entry.
2. Reply with signed storefront link (07-F3) → doc 06 opens with OTP skipped, source whatsapp.
3. Customer checks out on the storefront → `order.created`.
4. `order.confirmed` fires → confirmation message (session or template per window state) → ready/dispatched notifications follow → delivered close-out.
Failure path: branch offline → the "where is my order" auto-reply and the storefront status page tell the same honest queued state — one truth, two surfaces.

**Reorder quick-reply**
1. Returning customer messages anything → router sees order history → interactive list: last 3 orders, itemized short labels.
2. Customer picks one → proposal message: items, current prices, total; 86'd items dropped and named.
3. Confirm button → `order.created` (channel whatsapp) → standard lifecycle + notifications + metering (07-F5).
Failure path: customer wants changes → "Change" button hands off to a storefront link with the proposal preloaded as cart.

**Support routing**
1. "AC wala table free hai?" → no intent match → `whatsapp.inbound_received`, routed to counter/manager surface (07-F9).
2. Cashier replies from POS → outbound session message, staff-attributed.
3. No reply within 10 min → manager alert (07-F11).
Edge: the 24 h window is closed when staff reply → send is blocked with an on-surface explanation; the customer's next message reopens the window. Deliberately no ad-hoc-text template exists — that prevents template abuse.

**Owner analyst round-trip**
1. Verified owner sends "aj Tuesday se kam kyun?".
2. Transport passes `{org_id, user_id, role, conversation_id, locale, message_text}` to doc 13.
3. Doc 13 returns answer segments + citations → rendered, chunked, sent.
Failure path: doc 13 timeout (> 20 s) → honest "analyst is not responding, try again" message, incident logged (doc 15). The transport never improvises an answer — AI honesty (concept law 6) applies to the pipe too.

**OTP delivery for storefront checkout (serving 06-F12)**
1. Doc 06 requests an OTP for +92 3xx… via internal tRPC.
2. This service sends the `otp_code` authentication template to that number; `whatsapp.outbound_sent` + metering (class authentication) recorded.
3. Delivered → customer enters code on the storefront → doc 06 emits `customer.phone_verified`.
4. Failure path: no delivery status within 30 s → doc 06 triggers its SMS fallback; the WhatsApp attempt's failure is recorded (`whatsapp.outbound_failed`), never retried into a double-OTP.

**Template paused by Meta**
1. Meta pauses `order_ready` (quality drop) → status webhook → `whatsapp.template_status_changed`.
2. Fallback template takes over sends; doc 15 fleet-health alert raised.
3. No fallback defined → ready-notifications suppressed; org back office shows the degradation honestly until re-approval.

## 5. Data

- **Owned (cloud Postgres):**
  - `waba_accounts` — org ↔ WABA, number, encrypted tokens, quality/tier state.
  - `templates` — library masters + per-org instances + Meta status history.
  - `conversations` — customer and owner threads, window timestamps, routing mode.
  - `optin_optout` — per org, per phone, with provenance (checkout, in-chat, STOP).
  - `support_queue` read model — open support messages per org/branch.
  - Outbound job records (BullMQ) with idempotency keys.
- **Events emitted:** `whatsapp.*` family (§2), `customer.created / phone_verified`, `order.created` (reorder), `metering.usage_recorded`.
- **Events consumed:** `order.created / confirmed / rejected / line_state_changed`, `kot.printed`, `rider.picked_up / delivered`, `config.changed` (org channel settings), doc 13 push requests (nightly brief).

## 6. Non-functional requirements (module-specific)

- 07-N1 Webhook endpoint acks Meta < 2 s (processing deferred to queue); missed-webhook reconciliation via Cloud API message pull on gap detection.
- 07-N2 Kernel event → notification handed to Meta < 10 s p95 under 200-branch load (01-N4 conditions).
- 07-N3 Outbound retry: exponential backoff, max 6 attempts over 30 min; permanent failures emit `whatsapp.outbound_failed` and surface per 07-F17 / doc 15 — never silent.
- 07-N4 Per-org send-rate governor respects Meta messaging tiers; hitting a tier cap degrades marketing sends first, transactional last, with an org-visible warning (doc 14).
- 07-N5 Access tokens and webhook secrets encrypted at rest; a leaked org token is revocable per org without fleet impact.
- 07-N6 Conversation/window bookkeeping is rebuildable purely from `whatsapp.*` events (01-F7 discipline) — verified by a replay test in CI.
- 07-N7 Analyst transport overhead (inbound webhook → doc 13 handoff, and doc 13 response → Meta send) < 2 s combined; doc 13's own thinking time is outside this budget and surfaced with a typing indicator where the API allows.
- 07-N8 OTP sends (authentication class) bypass the per-org marketing/utility queues — a broadcast backlog must never delay a checkout OTP.

## 7. Customizability

- **Layer 1 (platform admin, doc 15):** WABA/number provisioning, own-number vs provisioned-number choice, message metering rates, template library management.
- **Layer 2 (org, doc 14):** notification classes on/off (within opt-in), support routing target (POS, manager console, both), auto-reply content values (hours, location text), verified analyst numbers, unanswered-support alert threshold.
- **Layer 3 (branch/device):** none — cloud service.
- **Deliberately not configurable:** opt-in requirement, opt-out honoring, 24 h window rules, template-only-outside-window rule, metering emission, analyst role checks. These are compliance and platform law.

## 8. Tech notes

- WhatsApp Business **Cloud API** (Meta-hosted) — no on-premise API server to operate; per-org WABA via embedded signup (tech-provider onboarding flow built in doc 15).
- Outbound exclusively through BullMQ queues (00 §3): per-org queue keys for tier governance; idempotency key = (org, kernel event id, template) so event redelivery never double-sends.
- Inbound pipeline: verify signature → persist raw → emit kernel event → intent router (verified-owner check, button payloads, fixed keyword set). The router is small and deterministic — no LLM in this service; doc 13 owns all AI.
- Interactive messages (lists, reply buttons) carry the reorder and menu flows; graceful text fallback for clients that strip them.
- This service is the OTP delivery arm for doc 06 (authentication template class) via internal tRPC — one template, both docs reference it.
- Testing: Meta webhook fixtures + a sandbox WABA in staging; the window-rule state machine is property-tested against random inbound/outbound interleavings.

## 9. Open questions

1. WhatsApp Flows (in-chat forms) for address capture or reorder editing instead of the storefront handoff — evaluate maturity at build time; the handoff link is the committed baseline.
2. Whether support threads need assignment/close semantics (mini-ticketing) or stay a shared inbox — decide from pilot support volume; bias: shared inbox, no ticket states.
3. Voice-note handling on the support rail (common in Pakistan): store-and-surface only, or transcribe via doc 13 — launch is store-and-surface.
4. Meta pricing-model evolution (per-message vs per-conversation billing) — the metering payload carries class + conversation id so doc 15 can re-rate historically; verify current Meta pricing at build time.
5. Analyst on group chats (owner + partners) — out of scope until doc 13 defines multi-party sessions; the contract currently assumes 1:1.
6. Number lifecycle on churn: what happens to a platform-provisioned number when an org leaves (parking period, transfer to org's own WABA) — policy owned by doc 15, mechanics to be specified before the first offboarding.
