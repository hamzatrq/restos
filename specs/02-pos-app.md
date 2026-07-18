# 02 — POS / Counter App

**Module spec — Draft 1, July 2026** · Parent: `00-platform-overview.md` (conventions §5–§7 inherited), `01-kernel-sync.md` (events, sync, auth). Mines v1 spec Module A (§3.1) for behavior detail. Wave 1.

## 1. Purpose & scope

The POS is the billing and order-capture surface of the branch: order entry for every service mode, payments and receipts, staff attribution, shifts and cash, phone/call-center order entry, and manual foodpanda quick entry. Used by cashiers, branch managers, counter staff, and call-center operators.

Two builds from shared `packages/domain` + `packages/sync-client` + `packages/escpos`:

- **Windows counter:** Electron + React. The Electron counter is the preferred branch hub (01-F13) and hosts the print service (doc 03).
- **Android:** React Native (Expo), for tablet-counter and secondary-terminal setups.

All tiers run it. In **T1 the POS is the entire restaurant** — one device, printers attached, statuses auto-advancing (02-F31). In T2/T3 it is the counter node of the branch mesh. Catalog and configuration are never edited here (doc 14 owns that); the POS is an operating surface.

## 2. Position in platform

- **Depends on:** kernel (doc 01) for ledger, sync, catalog snapshots, customer file, PIN auth; print service (doc 03, co-resident on the counter device) for KOT/receipt/drawer output.
- **References:** doc 05 (remote approval interrupts; day/cash ownership boundary), docs 06/07 (storefront/WhatsApp orders arriving in the queue), doc 08 (foodpanda item mapping for quick entry), doc 09 (rider dispatch surface at the counter — owned there, rendered alongside POS), doc 14 (catalog/config editing), doc 16 (fiscal receipt fields when the tax module is active).
- **Events emitted:** `order.*`, `payment.*`, `void/comp/discount.recorded`, `availability.changed`, `shift.*`, `day.*`, `cash.*`, `customer.created / address_added`, `receipt.*` (extension, §5), `audit.*`.
- **Events consumed:** branch order stream (all channels), `availability.changed`, `order.line_state_changed`, `approval.granted / denied` (doc 05), `kot.print_failed`, reference-data versions.

## 3. Functional requirements

**Order capture**
- 02-F1 Order types and channels:
  - types: dine-in (table), takeaway, delivery (own);
  - channel tags: counter, phone, storefront, WhatsApp, foodpanda;
  - every order carries `order_type` + `channel` from creation (`order.created` / `order.channel_tagged`); neither is ever inferred later.
- 02-F2 Menu grid: category tabs, item search, big touch targets (≥ 48 dp), optional item photos, English labels (00 §5.6). A simple order is ≤ 2 taps from grid to confirm.
- 02-F3 Modifiers/variants: size, add-ons, spice level. Price is snapshotted on the line at add (01-F18); each variant may carry its own recipe (deduction, doc 10 — invisible here).
- 02-F4 Park/resume open orders: `order.parked` / `order.unparked`. A parked order is durable (00 §5.2) and visible to every terminal in the branch.
- 02-F5 Split a bill by item or equal split (`order.split`, child orders referencing the parent); merge tables (`order.merged`); move table (a new `order.table_assigned`). Nothing is deleted in any of these — pure event composition.
- 02-F6 Item notes to kitchen: free text + org-configurable quick-tags ("less spicy") → `order.note_added`, printed prominently on the KOT (doc 03).
- 02-F7 Availability toggle ("karahi finished") from any POS screen → `availability.changed`, fast-path to all devices and channel drivers (01-F22); toggled-off items grey out on the grid within the LAN budget (01-F15).
- 02-F8 Confirm boundary: confirming an order emits `order.confirmed` and hands KOT jobs to the print service (doc 03). Line removal pre-confirm is `order.line_removed`; post-confirm it must be `void.recorded` with an approver (01 §4).
- 02-F9 Incoming channel orders (docs 06/07/08) appear in the same queue channel-tagged, raise an audible chime, and auto-print KOT per channel config. Acceptance semantics belong to the owning channel doc.
- 02-F10 Order queue and recall: open orders searchable by order number, table, or customer phone; settled orders of the current day recallable read-only (receipt reprint per 02-F16). Aging colors follow doc 03 thresholds.
- 02-F11 Multi-terminal coherence: an order started on one terminal can be parked there and resumed, extended, or settled on another; concurrent line-adds from two terminals merge (01-F16).

**Payments & receipts**
- 02-F12 Payment methods (`payment.recorded`), amounts in integer paisas (00 §6):
  - cash (change due computed and displayed);
  - card (manual record at launch, §9);
  - bank transfer / RAAST;
  - khata credit (02-F14).
- 02-F13 Split payment across methods in one settlement (`payment.split_recorded`) — e.g. part cash, part RAAST.
- 02-F14 Khata requires a linked customer (name + phone → customer file, 01-F23); the unpaid balance is a receivable visible per customer on the POS; later repayment is a `payment.recorded` referencing the original order(s).
- 02-F15 Receipt printing 58/80 mm via doc 03: configurable header/footer/logo, optional QR (menu link, or FBR invoice QR when doc 16 is active). Receipt content:
  - order number, channel, date/time, cashier;
  - lines with variants/modifiers, discount lines, totals;
  - payment method(s) and change;
  - fiscal fields when doc 16 is on.
- 02-F16 Success emits `receipt.printed`; reprint is always logged with actor (`receipt.reprint_requested`) — reprints are a classic fraud vector and feed doc 12/13 anomaly alerts.
- 02-F17 Channel + payment method are captured on every settled order — feeds channel economics (docs 12/13) and tax posture (doc 16).

**Staff attribution & controls**
- 02-F18 Per-user PIN login on every device (01-F26); idle auto-lock (device-layer timeout). No anonymous mode exists; a locked device shows only the unlock screen.
- 02-F19 Every action is attributed in the event envelope: order created, line added/removed, discount, void, comp, reprint, drawer open, settlement, availability toggle.
- 02-F20 Manager escalation required for: void after KOT, comp, discount above org threshold, price override (`order.line_price_overridden`, extension §5). Two equivalent authorization paths:
  - local manager PIN on the POS;
  - remote approval via manager console (doc 05, `approval.requested/granted`).
  First response wins; the recorded event carries actor + approver either way.
- 02-F21 No-sale drawer opens: `cash.drawer_opened` with `reason=no_sale`, logged and counted (classic theft vector); surfaced in doc 12 alerts.

**Shifts & cash**
- 02-F22 Day open: opening float entry → `day.opened`. Shift open per cashier → `shift.opened`. A shift binds subsequent cash settlements and drawer events to that cashier.
- 02-F23 Shift close per cashier (`shift.closed`):
  - system-expected cash (by method) vs counted cash; over/short recorded and attributed;
  - the cashier sees their own reconciliation on-screen at close ("I'm clean") — the staff-protection framing;
  - cashiers see only their own shifts (v1 §2.2); cross-cashier views belong to manager/owner surfaces (docs 05/12).
- 02-F24 Day close: manager cash count + deposit record → `day.closed`, `cash.deposit_recorded`; a day-summary ticket (sales by channel, voids/comps/discounts, over/short) can be printed via doc 03. Day close triggers the owner nightly summary (doc 12).
- 02-F25 Manager-attributed day/cash flows are also executable from the manager console — the ownership boundary is defined in doc 05 §3; the POS retains the full fallback so a branch without a manager phone loses nothing.
- 02-F26 Paid-outs/petty cash: reason + receipt photo (object storage ref) → `cash.paid_out`; approval above threshold per doc 05.

**Phone / call-center entry**
- 02-F27 Incoming call flow:
  - operator types the caller's number (caller-ID integration is an open question §9);
  - customer file lookup by normalized phone → name, saved addresses, order history, "repeat last order" shortcut;
  - unknown number → inline customer creation (`customer.created`, `customer.address_added`).
- 02-F28 Target: a repeat customer's order entered and confirmed in ≤ 30 s from number entry (tested with a rehearsed operator on reference hardware).
- 02-F29 (Multi-branch profile only, Wave 4) Call-center mode routes the order to the nearest branch by address zone (zone→branch mapping maintained in doc 14); the order lands in that branch's queue as channel `phone` and prints there. If the target branch is unreachable, the operator is told immediately and may pick another branch — never a silent drop.

**Foodpanda manual quick entry**
- 02-F30 Dedicated quick-entry mode: channel pre-tagged `foodpanda`, item picker restricted to the mapped menu (mapping owned by doc 08), no settlement step (aggregator-collected; economics handled by doc 08). Target ≤ 30 s per order. Quick-entry orders behave identically downstream: KOT print, inventory deduction, channel reporting.

**T1 mode & sync honesty**
- 02-F31 T1 mode — the entire restaurant runs on this one device:
  - detection: the branch device registry contains no pass/KDS/waiter device;
  - the POS shows a compact order-queue panel with aging timers (doc 03 thresholds);
  - line statuses auto-advance where no device exists to signal them: `kot.printed` → lines `in_prep`; settlement → lines `served` — **dine-in/takeaway/pickup only**. Delivery lines are NEVER advanced by settlement (COD settles at the door or on rider return): they advance only via `rider.picked_up / delivered` or the counter's on-behalf dispatch entries (09) — canonical rule in 01 §4;
  - no `ready` state is fabricated — the timing pipeline honestly receives no ready samples in T1 (03-F26), and T1 restaurants therefore never get learned ETAs (aging timers only).
- 02-F33 Ready-marking on POS (T2/T3): when the org's ready-signal ownership (03-F24) is assigned to **counter**, the POS queue panel exposes per-order ready marking (marks all remaining lines ready, one tap); otherwise the panel is read-only for states.
- 02-F32 Sync honesty on-device (00 §5.7): a persistent, non-blocking indicator shows outbox depth and last cloud ack (01-F11). Local operation is never gated on it.

## 4. Key flows

**Dine-in order (happy + print failure)**
1. Cashier PIN-unlocks → taps table → builds order from grid (lines persisted locally as events before UI ack, 01-F2).
2. Confirm → `order.confirmed` → print service routes KOTs by category (doc 03).
3. Failure path: a routed printer is offline → spooler retries → loud on-device alert names printer + order (03-F4); the order remains valid; cashier reroutes or reprints after fixing.
4. Later: settle (any method/split) → receipt prints → lines close → table frees.

**Split bill & settle**
1. Table asks to split → cashier splits by item → `order.split` creates two child orders referencing the parent → each settles independently (one cash, one card) → both receipts print; reporting sees two settlements, one service.

**Void after KOT with remote approval**
1. Cashier initiates void with reason → `approval.requested` (type `void`) goes to the manager console; the POS simultaneously offers local manager-PIN entry.
2. Manager one-tap approves on their phone (doc 05) → `approval.granted` propagates over LAN < 1 s → POS emits `void.recorded` with actor + approver. Denial or timeout leaves the line intact.

**Phone order (repeat customer)**
1. Number entered → customer card renders with addresses + history → "repeat last order" → adjust → confirm ≤ 30 s → KOT prints → dispatch handoff per doc 09.

**Foodpanda quick entry**
1. Rider/tablet order shouted from the aggregator tablet → operator opens quick entry → taps 3 mapped items → confirm ≤ 30 s → KOT prints, channel-tagged `foodpanda` → inventory and channel reports stay truthful with zero extra work later.

**Shift close**
1. Cashier taps close shift → system shows expected cash by method → counts drawer → over/short computed, attributed, shown to the cashier → `shift.closed` → manager sees variance on console/day close.

**T1 evening**
1. Single device: orders, KOTs, receipts, availability toggles, shift and day close all on one terminal; queue panel shows aging; statuses auto-advance per 02-F31. WAN state is irrelevant throughout (00 §5.1).

## 5. Data

- **Materialized (device SQLite, folded per 01-F6):** open orders + lines, table occupancy, availability set, current shift/day, drawer expectation, khata receivables, customer cache (recent + phone-indexed), reference-data snapshot.
- **Emitted:**
  - `order.created / line_added / line_removed / confirmed / parked / unparked / split / merged / table_assigned / note_added / channel_tagged / line_price_overridden`
  - `payment.recorded / split_recorded` · `void/comp/discount.recorded`
  - `availability.changed`
  - `shift.opened/closed` · `day.opened/closed` · `cash.drawer_opened / paid_out / deposit_recorded`
  - `customer.created / address_added`
  - `receipt.printed / reprint_requested` · `audit.*`
- **Extensions to 01 §4 introduced by this doc:** `order.confirmed`, `order.unparked`, `order.split`, `order.line_price_overridden`, `receipt.printed`, `receipt.reprint_requested`. (`approval.*` is defined in doc 05.)
- **Consumed:** branch order stream, `order.line_state_changed`, `availability.changed`, `approval.granted/denied`, `kot.print_failed`, reference-data/config versions.

## 6. Non-functional requirements (module-specific)

- 02-N1 Inherited targets apply unchanged (00 §5.3): line add < 100 ms, confirm → KOT start < 2 s, cold start < 6 s — on the PKR 25k reference tablet and the old-Windows-10 reference PC.
- 02-N2 Menu grid stays within the 100 ms line-add budget at 300 menu items × 5 variants; search results < 150 ms keystroke-to-render.
- 02-N3 Phone entry (02-F28) and quick entry (02-F30) each ≤ 30 s, measured in release builds.
- 02-N4 ≥ 5 concurrent POS devices per branch stay LAN-coherent (v1 §7) within kernel propagation targets (01-F15).
- 02-N5 A parked order is plug-pull safe the moment the park action returns (00 §5.2).
- 02-N6 Any core cashier flow learnable in < 15 min (00 §5.6) — validated with real staff at dev-pilots before Wave 1 sign-off.

## 7. Customizability

- **Layer 2 (org):** enabled order types and payment methods; khata on/off; discount threshold % and void/comp approval rules (01-F26); receipt header/footer/logo/QR; kitchen quick-tags; call-center zone→branch routing; channel chime behavior; remote-vs-local approval preference.
- **Layer 3 (branch/device):** printer assignments, idle-lock timeout, default opening float, quick-entry shortcut visibility.
- **Deliberately not configurable:** attribution (no shared/anonymous logins), append-only corrections, escalation bypass below org thresholds, drawer-open logging, channel tag on ingested orders, the sync-honesty indicator.

## 8. Tech notes

- Electron: main process owns `packages/escpos` transports, the hub role, and `better-sqlite3`; renderer is React with a virtualized menu grid. RN build: Expo + `op-sqlite`, Hermes; same fold/domain code.
- Offline PIN auth per 01-F28; role/permission matrix synced as reference data.
- Split/merge/move are pure event compositions — no special sync handling; kernel conflict rules 01-F16/F19 cover concurrent edits.
- Photos (paid-out receipts) are captured locally, uploaded opportunistically to object storage, and referenced by id in the event — the event never waits for the upload.
- Rush-simulation load (00 §4) runs against a full POS + printer rig before each release-channel promotion (doc 15).

## 9. Open questions

1. Caller-ID capture on Windows (TAPI/USB modem) and Android (call-log permission policy) — manual number entry is the committed baseline.
2. Card payments: manual record only at launch; terminal integration (which acquirer, if any) deferred.
3. Khata statement/settlement UX depth here vs the customer-facing surfaces (docs 06/07) — receivable events are shared either way.
4. Refund of a settled order (customer returns food after payment): modeled as a correction event pair or a negative payment — needs a kernel-conformant design before Wave 1 code.
5. Quoted-ETA display at phone entry once doc 03 publishes confident estimates — display ownership currently sits with docs 04/06/13; extending it to phone entry needs a spec PR here.
