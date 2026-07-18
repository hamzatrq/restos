# 09 — Rider App, Dispatch & COD Settlement

**Module spec — Draft 1, July 2026** · Status: draft for review · Parent: `00-platform-overview.md` (conventions §5–§7 inherited), `01-kernel-sync.md` (events, auth, sync). Concept refs: v2 concept §4.3 (delivery & riders — launch requirement; route optimization and rider marketplace explicitly out). Wave 2.

## 1. Purpose & scope

Own-delivery for restaurant-employed and informal riders: a dispatch capability at the counter/manager surfaces, an Expo React Native rider app on the rider's own Android phone (BYOD), and cash-on-delivery settlement that mirrors the cashier shift-close pattern. This is **not a marketplace** — riders belong to the restaurant — and there is **no route optimization**: the system records who carries what and what cash is owed; humans decide routes.

Dispatch UI is hosted by docs 02 (POS counter) and 05 (manager console); **this doc owns the dispatch logic, state model, and settlement rules** those surfaces implement. The rider app is `apps/rider`. Applies to any org with own delivery enabled (all profiles; cloud kitchens lean on it hardest).

Out of scope, explicitly:
- route optimization (scope law from concept §4.3) and live GPS tracking;
- rider marketplace of any kind;
- third-party rider APIs (Bykea-style) — fast-follow behind a future dispatch target, not this spec;
- rider payroll math — doc 11 owns the staff ledger; settlement events feed it;
- customer-facing rider tracking beyond the status states doc 06 already shows.

## 2. Position in platform

- **Consumes:** delivery orders (`order.created` with delivery mode from docs 02/06/07/08 where own-rider delivery applies), customer file address/phone for assigned orders (01-F23), user/role reference data (01-F26), `staff.clocked_in / clocked_out` (roster), `payment.recorded` (prepaid vs COD determination).
- **Emits:** `rider.assigned / picked_up / delivered / settled` (from 01 §4), extended with `rider.unassigned / delivery_failed`; `cash.deposit_recorded` (settlement cash into the drawer, ref to the settlement event).
- **Depends on:** doc 01 sync client + auth (rider devices are registered devices with a scoped slice), docs 02/05 as host surfaces, doc 11 (over/short attribution lands on the staff ledger), docs 12/13 (reporting consumers).
- **Extends 01 §4 catalog** (spec PR): `rider.unassigned`, `rider.delivery_failed`.

## 3. Functional requirements

**Rider identity & device**
- 09-F1 A rider is a user with role `rider` (01-F26): PIN unlock, per-branch assignment, revocable. The app runs on the rider's personal Android phone, registered as a device (01-F25) via a pairing code from back office; revocation cuts access at next contact.
- 09-F2 Rider devices sync a **scoped slice only**: their own assignments, the delivery details (address, phone, COD amount, notes) of those orders, and their own settlement history. They are **not** branch-LAN mesh participants and never hold the branch event stream — this resolves 01 §9 Q2 for the rider device class (BYOD privacy + storage). Sync is cloud-path only.
- 09-F3 On unassignment or settlement, the corresponding order's customer details are purged from the rider device at next sync; the app retains only event stubs for the rider's own history view.

**Dispatch (logic owned here; surfaces in docs 02/05)**
- 09-F4 The dispatch surface lists: unassigned delivery orders (ready or nearing ready, aging-colored), on-duty riders with current load (orders out, running COD carried, last-event age), and settlement-pending riders. On-duty = rider clocked in (doc 11) or manually toggled on-duty at the counter.
- 09-F5 Assign: select order(s) → select rider → one `rider.assigned` event per order (batch = N events, one confirm). Assignment works with WAN down — it is a branch-side kernel event; the rider is told verbally and their app reflects it on next connectivity. Dispatch never blocks on the rider app being reachable.
- 09-F6 Unassign/reassign: `rider.unassigned` then `rider.assigned` to another rider. Status events arriving later from a since-unassigned rider's offline queue are parked and flagged on the dispatch surface for human resolution (01-F20 append-and-merge; nothing auto-discarded, nothing auto-applied).
- 09-F7 Batch assignment groups multiple orders to one rider in one action; each order keeps independent status progression. There is no "trip" entity in v1 — the batch is a UI convenience, not a state.
- 09-F8 Counter/manager may record `picked_up / delivered / delivery_failed` **on behalf of** a rider (rider phoned it in, or app-less informal rider): the event's actor is the counter user, payload carries `on_behalf_of: rider_user_id`. An informal rider with no smartphone is therefore fully supported — dispatch and settlement work; only the self-serve app is absent.
- 09-F9 Honest staleness: every rider row on the dispatch surface shows last-event age ("picked up · 24 min ago · device last synced 3 min ago", per 00 §5.7). Stale rider state is displayed as stale, never as current.

**Delivery state model (normative)**

| State | Set by | Event | Notes |
|---|---|---|---|
| ready_for_dispatch | kitchen/pass (docs 02/03) | `order.line_state_changed` (all lines ready) | enters the unassigned pool |
| assigned | dispatcher | `rider.assigned` | reversible via `rider.unassigned` |
| picked_up | rider (or on-behalf, 09-F8) | `rider.picked_up` | COD moves to "carrying" |
| delivered | rider (or on-behalf) | `rider.delivered` | COD moves to "owed", awaits settlement |
| failed | rider (or on-behalf) | `rider.delivery_failed` | back to pool, flagged (09-F18) |
| settled | counter/manager | `rider.settled` | terminal for the cash side |

No other states exist; surfaces may not invent intermediate ones (e.g. "arriving") — the model only claims what an event proves.

**Rider app**
- 09-F10 Assigned-order list, oldest first: customer name, address text, order contents summary, COD due (or "COLLECT NOTHING" for prepaid/RAAST **and khata-credit** orders — a khata delivery creates a receivable on the customer file via doc 02's khata ledger, and the rider collects zero), delivery notes. Tap-to-call the customer via the OS dialer; the number is never copyable to clipboard.
- 09-F11 Status progression per order, two taps: `picked_up` → `delivered`. `delivery_failed` requires a reason from a fixed list (customer unreachable, wrong address, refused, other + note). No other states, no skipping — `delivered` requires `picked_up`.
- 09-F12 Cash header, always visible: running total the rider owes = COD of delivered-unsettled orders + COD being carried (picked-up, not yet delivered), itemized on tap. PKR display per 00 §5.6; integer paisas underneath (00 §6).
- 09-F13 Offline tolerance: every status tap persists locally first (01-F2) and queues in the outbox; the app pushes on any connectivity — riders lose signal constantly. The UI marks each event "synced / waiting for signal" honestly. Events carry `device_created_at`, so timing analytics use true action time, not sync time.
- 09-F14 English-only UI (00 §5.6); the entire rider flow is learnable < 15 min — three screens total: order list, order detail, my cash/history.

**COD settlement (mirror of cashier shift close, v1 spec A5)**
- 09-F15 Settlement is initiated at the counter/manager surface when the rider returns: the system shows expected cash = Σ COD of the rider's delivered-unsettled orders. Counted cash is entered; `rider.settled` records `{ order_ids, expected_paisas, returned_paisas, over_short_paisas, settled_by }`. Orders still out (assigned/picked-up) are excluded and carry forward. Partial settlement of the delivered set is not allowed — it is all delivered-unsettled orders at that moment.
- 09-F16 Over/short is recorded and **attributed to the rider**, mirroring cashier over/short: visible to the rider in their app ("I'm clean" protection framing, v1 spec §2), on the manager day view (doc 05), in owner reporting (doc 12), and on the staff ledger (doc 11). Over/short beyond an org threshold requires manager-PIN approval to close (approval-interrupt pattern, doc 05).
- 09-F17 Settlement cash entering the drawer emits `cash.deposit_recorded` referencing the `rider.settled` event — drawer math (doc 02 shift close) stays whole with no manual re-entry.
- 09-F18 `delivery_failed` orders return to the dispatch pool flagged for a decision: re-dispatch, convert to pickup, or void under normal approval rules (docs 02/05). Their COD never enters the rider's expected cash. Day close (doc 05) blocks while any rider has delivered-unsettled orders or any failed order is undecided — nothing dangles overnight silently.

- 09-F19 A settlement slip prints on the counter printer via doc 03 at close: rider name, order list, expected/returned/over-short — the rider's paper proof, mirroring the cashier shift-close slip. Reprint is logged (the `kot.reprint_requested` pattern applies to slips).

**Reporting hooks**
- 09-F20 Events emitted here give docs 12/13 per-rider delivery counts, assigned→delivered spans (from event timestamps), failure rates, and over/short history. This module computes none of it; it only guarantees the events are complete and truthful.

## 4. Key flows

**Happy path**
1. Delivery order nears ready → dispatcher assigns to Imran → `rider.assigned`.
2. Imran's app shows the order: address, phone, COD PKR 1,850.
3. Food handed over → tap → `rider.picked_up`; cash header adds 1,850 "carrying".
4. Delivered, cash collected → tap → `rider.delivered`; header moves it to "owed".
5. After three orders Imran returns → counter opens settlement: expected 5,400 → counts 5,400 → `rider.settled` (over/short 0) → `cash.deposit_recorded` → cash header resets to zero.

**Batch assignment (same direction, one rider)**
1. Three ready orders for the same area → dispatcher multi-selects → picks Salman → one confirm → three `rider.assigned` events.
2. Salman's app lists all three, oldest first; cash header sums the three COD amounts as he picks each up.
3. Each order progresses independently (09-F7): delivered #1 and #2, customer #3 unreachable → `rider.delivery_failed` for #3 only.
4. On return, settlement covers #1 + #2 cash; #3 sits flagged in the pool for the manager's decision.

**Offline rider**
1. Imran loses signal after pickup; taps `delivered` at the door → persisted locally, marked "waiting for signal" (09-F13).
2. Dispatch shows "picked up · 40 min ago · device unreachable 35 min" — stale, labeled stale (09-F9).
3. Signal returns → events push with true `device_created_at` → dispatch catches up.
4. Variant: the counter had already recorded delivered on his behalf (09-F8) → both events merge to the same terminal state, both attributed — no conflict (01-F16 semantics).

**Short settlement**
1. Expected 6,200; counted 5,700 → over/short −500 recorded, attributed to the rider.
2. Short exceeds the org's 300-rupee threshold → manager PIN required to close (09-F16).
3. Settlement closes; the shortfall stands in the ledger as a fact, visible to rider, manager, owner. Correction only by a new linked record (00 §5.5) — e.g. a later recovery entry per org practice on the staff ledger (doc 11).

**Reassignment mid-route**
1. Imran's bike breaks down after picking up two orders → dispatcher unassigns both (`rider.unassigned`), assigns Salman, who retrieves the food.
2. Imran's phone later syncs a stray `delivered` tap made post-unassignment → parked + flagged (09-F6); the manager resolves it against reality.
3. Cash rule: any order Imran actually delivered before the breakdown stays his for settlement; undelivered orders carry no cash expectation against him.

**Failed delivery**
1. Customer unreachable → `rider.delivery_failed (customer_unreachable)` → order back in the dispatch pool, flagged (09-F18).
2. Manager re-dispatches once → second failure → void under approval rules (docs 02/05).
3. The failed order's COD never appears in any rider's expected cash; day close stays blocked until the decision is made.

## 5. Data

- **Owned:**
  - Dispatch read model (branch-materialized and cloud-materialized from the same fold): unassigned pool, per-rider load and cash position, settlement-pending list, parked/flagged stray events.
  - Settlement records — projection of `rider.settled`, joined to the staff ledger by doc 11.
  - On-duty roster state (from clock-in events or manual toggle events).
  - Rider device SQLite: scoped slice per 09-F2 — assignments + delivery details, event outbox, own history stubs.
- **Events emitted:** `rider.assigned / unassigned / picked_up / delivered / delivery_failed / settled`, `cash.deposit_recorded` (ref settlement).
- **Events consumed:** `order.created / confirmed / line_state_changed` (delivery orders, readiness), `payment.recorded`, `staff.clocked_in / clocked_out`, `customer.address_added`.

## 6. Non-functional requirements (module-specific)

- 09-N1 Rider app runs on low-end Android (2 GB RAM); cold start < 4 s; a status tap gives UI feedback < 100 ms and is plug-pull durable (00 §5.2–5.3 applied to the rider device).
- 09-N2 Rider status event → visible on the dispatch surface < 5 s p95 when both ends are online (cloud path; riders are never LAN-mesh peers).
- 09-N3 App data footprint < 50 MB (scoped slice + purge per 09-F3); functional on intermittent 2G-grade connectivity — event payloads are tiny and batched.
- 09-N4 No continuous GPS or background location: battery on a personal phone is respected, and no-route-optimization is a scope law (concept §4.3). Geofenced "arrived" detection is explicitly rejected for v1 (§9).
- 09-N5 Settlement math is property-tested: for any event interleaving (offline duplicates, on-behalf entries, reassignments), expected cash equals the fold over delivered-unsettled COD orders — identical on every device (01-N1).
- 09-N6 Dispatch surfaces remain fully functional with WAN down (branch-side fold, 09-F5); the only WAN-dependent capability is seeing the rider app's self-reported state, and its absence is displayed per 09-F9 — never papered over.

## 7. Customizability

- **Layer 1 (platform admin, doc 15):** rider device-class registration limits per org tier.
- **Layer 2 (org, doc 14):** over/short manager-approval threshold, failed-delivery reason list (from platform presets), on-duty via clock-in vs manual toggle, advisory max load per rider (soft warning only — dispatch is never blocked by it), delivery-order COD cap.
- **Layer 3 (branch/device):** dispatch-surface default sort.
- **Deliberately not configurable:** the status state machine and its ordering, settlement covering all delivered-unsettled orders (no cherry-picking), over/short attribution, append-only settlement corrections, customer-detail purge on unassign/settle, the absence of GPS tracking.

## 8. Tech notes

- `apps/rider`: Expo React Native + `op-sqlite`, using `packages/sync-client` in a **scoped-subscription mode** — subscribe by assignment predicate rather than branch stream. This is a small addition to doc 01's pull protocol, spec-PR'd there; it is the one kernel change this module needs.
- Dispatch logic ships as a shared package consumed by the doc 02 and doc 05 surfaces (one fold, two hosts); the dispatch read model materializes identically branch-side (works WAN-down) and cloud-side (owner visibility).
- Tap-to-call uses the OS dialer intent — the rider's own SIM carries the call; no telephony infrastructure. Number masking/proxying is out of scope (§9 Q1).
- FCM push nudges the rider app to sync on new assignment; the app never depends on push for correctness — pull-on-open and periodic background fetch cover it (Doze-mode-safe).
- EAS build channel for the rider app follows staged rollout (00 §3); BYOD implies old devices — minimum SDK Android 10 per v1 spec §3.1 A7.
- Maestro flow tests (00 §4) cover the three-screen rider journey including an airplane-mode segment; the rush simulator gains a delivery-order profile to exercise dispatch under load.

## 9. Open questions

1. Customer-facing caller ID: the rider's personal number is exposed when calling customers. Proxy/masking needs telephony infrastructure — deferred; decide if pilots surface complaints.
2. Whether `rider.delivered` should optionally capture a proof point (photo/note) for dispute handling — bias no (friction at the door); revisit with pilot dispute data.
3. Informal-rider daily-wage interaction with settlement shortfalls (deduct from wage?) — doc 11 staff-ledger policy; this module only guarantees the attributed over/short events exist.
4. Third-party rider dispatch (Bykea-style API) as a future dispatch target: pre-shape `rider.assigned` for non-user assignees now, or extend later? Bias: extend later; keep the v1 payload user-keyed.
5. Multi-branch riders (one rider serving two nearby branches of an org): per-branch assignment (01-F26) technically allows it and settlement is per-branch drawer — confirm the flow with a multi-branch pilot before documenting it as supported.
6. Whether the customer status page (doc 06) should show rider name/phone after dispatch — privacy trade both directions; launch shows "dispatched" only.
7. Shared-phone riders (two riders alternating one device): device registration is per-device, PIN session is per-user (01-F26) — technically supported, but the scoped slice would carry both riders' assignments. Decide whether to scope the slice per PIN session before documenting shared devices as supported.
