# 05 — Manager Console

**Module spec — Draft 1, July 2026** · Parent: `00-platform-overview.md` (conventions §5–§7 inherited), `01-kernel-sync.md`. Wave 1 core (alarms + approval interrupts); Wave 4 full (floor state, channel pulse, day/cash flows, paid-out approvals).

## 1. Purpose & scope

The manager's operational surface, running on the **manager's own phone** (React Native, Android + iOS). It replaces walk-to-counter interruptions with interrupts that come to the manager:

- **Wave 1 core:** late-order alarms, print-failure alarms, and approval interrupts — void/comp/discount approvals arrive as one-tap PIN-authorized actions on the manager device, fully logged.
- **Wave 4:** floor state (table map), channel pulse (per-channel load; pause/throttle a channel when the kitchen is drowning), day open/close and cash-count flows, paid-out approvals.

Works in-branch over LAN and remotely over cloud; remote views always carry sync-honesty labels (00 §5.7). All tiers and profiles get the console; floor state requires T3 tables (doc 04). This is the *operational* manager surface — the owner's analytical surface is doc 12; back-office configuration is doc 14.

## 2. Position in platform

- **Depends on:** kernel (doc 01) — full branch slice on the manager device, PIN auth, fast-path LAN; aging thresholds and print-failure events (doc 03).
- **References:** doc 02 (escalation flows; the day/cash ownership boundary in §3 below), doc 03 (aging config, `kot.print_failed`, `printer.status_changed`), doc 04 (`table.state_changed` for floor state), doc 06 (storefront pause behavior), doc 08 (foodpanda pause/availability push), doc 12 (owner app — a distinct surface), doc 13 (throttle suggestions via the autonomy ladder, future).
- **Events emitted:** `approval.requested / granted / denied` (extension, defined here), `channel.paused / resumed / throttled` (extension), `day.opened / closed`, `cash.deposit_recorded`, `availability.changed`, `audit.*` (alarm acknowledgments, PIN authorizations).
- **Events consumed:** `order.*` (aging, queue), `kot.print_failed`, `printer.status_changed`, `table.state_changed`, `shift.opened / closed`, `cash.*`, `void/comp/discount.recorded`, `eta.estimates_published` (context in channel pulse).

## 3. Functional requirements

**Wave 1 core — alarms**
- 05-F1 Late-order alarm: when an order (or line) crosses the red aging threshold (03-F14), the console raises an alarm naming order, channel, table, and age. Delivery:
  - in-branch: LAN fast path, < 2 s;
  - remote: high-priority push (FCM/APNs) whenever the branch has WAN.
- 05-F2 Alarms persist in an active list until the order goes ready/served or the manager acknowledges; acknowledgment is logged (`audit.*`, hash-chained per 01-F5). Alarms are never auto-dismissed silently.
- 05-F3 Print-failure alarms: `kot.print_failed` and `printer.status_changed(offline)` raise on the console with the same persistence rules — "the kitchen can't print" must reach the manager even off the floor (03-F5 companion).
- 05-F4 Alarm volume discipline: one alarm per order per threshold crossing; repeated crossings collapse into the existing alarm with an updated age. The console must stay useful during a bad rush, not become a siren wall.

**Wave 1 core — approval interrupts**
- 05-F5 POS escalations (02-F20) arrive as interrupts: void-after-KOT, comp, discount above threshold, price override. The interrupt card shows:
  - requester (name, role) and requesting device;
  - order/line refs, item names, amounts;
  - stated reason;
  - context: order total, channel, table — enough to decide without walking over.
- 05-F6 One-tap approve/deny, authorized by the manager's PIN **on the manager device** → `approval.granted` / `approval.denied` referencing the request; the grant propagates to the requesting POS over LAN < 1 s and unblocks it. The resulting `void/comp/discount.recorded` carries actor + approver; every decision is fully logged.
- 05-F7 Event extension defined by this doc: `approval.requested / granted / denied`. Request payload:
  - `approval_type`: `void | comp | discount | price_override | paid_out`;
  - `refs[]` (order/line/paid-out ids), `amounts`;
  - `requester_id`, requesting `device_id`;
  - `context` (order total, channel, photo ref for paid-outs).
  Grants reference the request id, are idempotent, and the first response wins (02-F20).
- 05-F8 Fallback and timeout: if no manager device responds within N s (default 30, layer 2) or none is reachable, the POS local manager-PIN path (02-F20) remains fully available. Remote approval augments service; it never gates it.
- 05-F9 Approvals work remotely over cloud when WAN is up; the remote approval card shows data age (00 §5.7) before the manager commits, and the decision still lands as the same events.

**Wave 4 — floor state**
- 05-F10 Live table map folded from `table.state_changed` (doc 04) + open-order state: per table — state, age in state, order total, waiter. T3 only.
- 05-F11 The floor map is read-only except needs-bill acknowledgment; changing an order or table happens on the owning surface (docs 02/04). Same fold as POS and waiter map — one fold, three renderers (`packages/domain`).

**Wave 4 — channel pulse**
- 05-F12 Per-channel load view — the "is the kitchen drowning" glance. Per channel (dine-in, phone, storefront, WhatsApp, foodpanda):
  - open orders now;
  - confirms per 15 min (against the branch's usual rush curve);
  - aging distribution (count in amber, count in red);
  - print-failure count for the day.
- 05-F13 Pause a channel: `channel.paused` (extension; payload `{channel, reason, auto_resume_at?}`). Pausing the storefront makes it show an honest temporarily-closed state (doc 06); pausing foodpanda triggers the aggregator availability/closing push (doc 08). Resume is `channel.resumed`, manual or by the `auto_resume_at` timer.
- 05-F14 Throttle a channel: `channel.throttled` (payload `{channel, added_eta_minutes?, max_orders_per_15min?}`) — quoted ETAs stretch and/or intake caps, applied by the consuming channel doc (06/08).
- 05-F15 Every pause/throttle/resume is attributed and logged; the owner app surfaces the episode (doc 12), and doc 13 reads them as training signal for future suggestions.
- 05-F16 Staff-operated channels (dine-in, phone entry at POS) cannot be paused from the console — drowning there is a people decision, not a switch. Deliberate exclusion.

**Wave 4 — day, cash, paid-outs (ownership boundary with doc 02)**
- 05-F17 Boundary rule: **cashier-attributed drawer flows live in doc 02; manager-attributed flows live here, with a full POS fallback.** Counting always happens where the cash is; both surfaces emit the identical kernel events; no flow exists twice with different semantics.
  - Doc 02 owns: shift open/close per cashier, cashier drawer counts, float entry at the drawer, paid-out capture (reason + photo).
  - Doc 05 owns: day open/close initiation, the manager's day-close count entry, `cash.deposit_recorded`, paid-out approval.
- 05-F18 Day open/close from the console: the manager opens the day (float confirmed at the drawer via POS, or entered directly when the manager stands at the drawer with their phone) and closes it with the manager count + deposit record → `day.opened / closed`, `cash.deposit_recorded`.
- 05-F19 Paid-out approvals: `cash.paid_out` above the org threshold requires approval → arrives as an interrupt with the receipt photo inline → approve/deny per 05-F6/F7 (`approval_type: paid_out`).
- 05-F20 Shift-close visibility: cashier over/short results (02-F23) appear on the console as they land; variance beyond threshold is highlighted. The cashier-sees-own-reconciliation framing (02-F23) is unchanged — the console adds the manager's cross-cashier view, nothing about it replaces the cashier's own screen.

**Support inbox (Wave 2, with doc 07)**
- 05-F22 The console is the default target for WhatsApp support routing (07-F9): inbound customer support messages render as a threaded inbox (customer, order context if linkable, message history); replies send through doc 07 as attributed session messages. POS (doc 02) may be the org's configured alternative/additional target — same thread state, synced.
- 05-F23 Unanswered-support alerting: a thread with no staff reply past the org threshold (07 layer-2 setting) raises a console alarm — a support message silently ignored is a lost customer.

**Console home**
- 05-F21 The home screen is a glance, not a dashboard: active alarms, pending approvals, open-order count with aging summary, shift/day status, channel-pulse tile (Wave 4), support-inbox badge (Wave 2). Deep analytics stay in doc 12 — the console exists for acting in the next sixty seconds.

**Remote mode**
- 05-F22 The full console works over cloud from anywhere. Every screen shows last-synced age; when the branch is unreachable, the console says so plainly ("branch offline — last seen 12 min ago") and never renders stale state as live (00 §5.7).
- 05-F23 Remote alarm push continues via FCM/APNs whenever the branch has WAN; while the branch is offline, the console shows the alarm gap honestly instead of implying calm.

## 4. Key flows

**Void approval (happy + fallback)**
1. Cashier requests void-after-KOT → `approval.requested` hits the manager's phone < 2 s → interrupt shows item, amount, reason → manager taps approve + PIN → `approval.granted` → POS records the void with approver. Seconds elapsed; nobody walked anywhere.
2. Fallback: manager's phone is dead → 30 s timeout → POS offers local manager-PIN → same recorded outcome, different authorization surface.

**Late-order alarm**
1. Order crosses the red threshold (03-F14) → alarm with order/channel/age → manager acknowledges (logged) → checks the pass screen or floor map → alarm clears itself when the order goes ready.

**Kitchen drowning → pause foodpanda**
1. Channel pulse shows foodpanda confirms spiking and reds accumulating.
2. Manager taps pause foodpanda, reason "kitchen overloaded", auto-resume 30 min → `channel.paused`.
3. Doc 08 pushes closed/unavailable to the aggregator; dine-in service continues undisturbed.
4. The timer fires `channel.resumed`. The whole episode sits in the ledger for docs 12/13.

**Paid-out approval**
1. Storekeeper records a PKR 4,000 paid-out with receipt photo at the POS (02-F26) → above threshold → `approval.requested` (type `paid_out`).
2. Interrupt with the photo inline on the manager's phone → approve + PIN → `cash.paid_out` completes with approver attached.
3. Denial: the paid-out stays pending at the POS with the denial reason; cash does not leave the drawer against the ledger.

**Day close**
1. Console shows all shifts closed + variances → manager counts the drawer at the counter, enters the count on their phone → deposit recorded → `day.closed` → owner nightly summary triggers (doc 12).

**Remote evening check (honesty path)**
1. Manager at home opens the console → screens show "synced 40 s ago" → an approval request arrives via push → the card shows data age before the PIN step → approve → events land at the branch over cloud.
2. Branch WAN drops → the console banner flips to "branch offline — last seen 3 min ago"; alarm silence is labeled as unknown, not calm (05-F23).

## 5. Data

- **Materialized (device):** active alarm list, pending approval queue, channel stats (15-min windows), floor map, day/shift status. No console-only source-of-truth entities — everything folds from the ledger, so a reinstalled phone reconstructs its state completely (01-F6).
- **Emitted:**
  - `approval.requested / granted / denied`
  - `channel.paused / resumed / throttled`
  - `day.opened / closed` · `cash.deposit_recorded`
  - `availability.changed`
  - `audit.*` (alarm acks, PIN authorizations)
- **Extensions to 01 §4 introduced by this doc:** `approval.requested / granted / denied`, `channel.paused / resumed / throttled`.
- **Consumed:** `order.*`, `kot.print_failed`, `printer.status_changed`, `table.state_changed`, `shift.*`, `cash.*`, `void/comp/discount.recorded`, `eta.estimates_published`.

## 6. Non-functional requirements (module-specific)

- 05-N1 Approval round trip, machine portion (request emitted → POS unblocked after the manager's tap), ≤ 2 s p95 on LAN.
- 05-N2 Alarm delivery: LAN ≤ 2 s; remote push best-effort with a 60 s in-app poll fallback while the app is foregrounded.
- 05-N3 Runs on the manager's personal phone:
  - Android 10+ and iOS (current − 2);
  - steady-state RAM ≤ 300 MB;
  - off-LAN the app is push-driven, not socket-polling — no battery-drain reputation.
- 05-N4 Console offline (phone dead, manager absent) must cost the branch nothing: every console flow has its POS fallback (05-F8, 05-F17).
- 05-N5 The approval queue and alarm list survive app kill/restart without loss — they are folds over the branch stream, re-derived on start (01-F6).

## 7. Customizability

- **Layer 2 (org):**
  - which approval types allow remote approval vs require at-counter PIN;
  - approval timeout N (05-F8);
  - paid-out approval threshold and photo requirement;
  - alarm thresholds (shared with doc 03 aging config);
  - variance highlight threshold;
  - which roles may pause/throttle channels;
  - auto-resume defaults.
- **Layer 3 (device):** alarm tone, on-duty routing (approvals routed to a designated on-duty manager rather than broadcast).
- **Deliberately not configurable:** disabling late-order or print-failure alarms while a business day is open; unlogged or PIN-less approvals; pausing staff-operated channels (05-F16); editing any recorded decision (append-only, 00 §5.5).

## 8. Tech notes

- Expo RN, Android + iOS; APNs matters — many owners/managers carry iPhones. Same `packages/sync-client`; the manager device holds a normal full branch slice (trusted role — doc 04's scoped-slice mechanism is not used here).
- iOS LAN participation needs the local-network permission prompt and falls back to cloud relay when the OS parks the socket; approvals must be correct, not LAN-dependent (05-F8 covers the gap).
- Channel-pulse windows are computed on-device from the branch stream — no cloud dependency in-branch.
- Approval interrupts use high-priority push categories (FCM high priority / APNs time-sensitive) so a pocketed phone still buzzes during rush.
- The console ships in the same staged-rollout discipline as the fleet (doc 15); a broken console build must never take the approval path down — hence 05-N4.

## 9. Open questions

1. Multi-manager concurrency: several managers on duty — broadcast approvals to all vs route to a designated on-duty manager (default: broadcast, first grant wins, idempotent; revisit at pilots).
2. Approval timeout default (30 s assumed) — tune against real kitchen rhythm at Wave 1 pilots.
3. Whether doc 13 may *suggest* a channel pause (autonomy ladder "act with approval" rung) as a pre-filled interrupt on this surface — gated on doc 13 maturity rules per restaurant.
4. iOS background socket limits vs alarm latency guarantees off-LAN — measure; may need a dedicated push category and delivery-latency telemetry (doc 15).
5. Whether day-open float entry directly on the console (manager at the drawer with their phone) needs a second-person confirmation on the POS for cash-control hygiene — decide with pilot accountants.
