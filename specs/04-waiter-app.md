# 04 — Waiter Handheld

**Module spec — Draft 1, July 2026** · Parent: `00-platform-overview.md` (conventions §5–§7 inherited), `01-kernel-sync.md`. T3 surface, Wave 4. Mines v1 spec Phase 2 (waiter/captain handheld) for scope discipline.

## 1. Purpose & scope

Tableside ordering for T3 full-mesh restaurants: waiters capture orders at the table straight to KOT, track table states, see live availability, and get notified when their tables' food is ready. Runs on cheap Android phones **including waiter-owned BYOD devices** — the app must be a good guest on a low-end personal phone: tiny install, low RAM, no access to data the waiter has no business holding.

Expo React Native, sharing `packages/domain` + `packages/sync-client` with the fleet. Not offered below T3; nothing in T1/T2 depends on it (tiers degrade gracefully, concept §4.1). The handheld deliberately does less than the POS. On it: capture, table state, ready signals, availability view. Not on it, by design:

- settlement and split/merge bills (counter, doc 02);
- void/comp/discount approval (manager, docs 02/05);
- cash, shift, and day flows (docs 02/05);
- customer-file browsing or reporting beyond the waiter's own attribution view.

## 2. Position in platform

- **Depends on:** kernel (doc 01) — LAN mesh participation, PIN auth, catalog/availability reference data; the confirm→KOT path (doc 02 02-F8 semantics, doc 03 printing).
- **References:** doc 03 (ready signals, waiter-on-pickup ownership, ETA publication), doc 05 (floor state consumes table states defined here), doc 02 (settlement at the counter; needs-bill signaling), doc 15 (BYOD update channels).
- **Events emitted:** `order.created / line_added / line_removed / confirmed / note_added / table_assigned`, `order.line_state_changed` (`ready` when waiter-on-pickup owns the signal; `served`), `table.state_changed` (extension, §5), `availability.changed` (if permitted), `audit.*`.
- **Events consumed:** `availability.changed`, `order.line_state_changed`, `order.confirmed` (own tables), settlement state on own tables, `eta.estimates_published` (doc 03), reference-data versions.

## 3. Functional requirements

**Device & identity**
- 04-F1 Registration via the standard one-time pairing code (01-F25), device class `handheld`. BYOD and restaurant-owned shared handhelds are both supported.
- 04-F2 A shared handheld allows any waiter-role PIN of the branch; a BYOD device may be limited to its owner's credential only (layer-2 choice). Idle auto-lock applies as on every shared device (01-F26).
- 04-F3 Per-waiter attribution: every line, note, and state change carries the waiter's user id from the PIN session. Per-waiter sales/tips reporting reads from this attribution (doc 12) — no extra entry, ever.
- 04-F4 Scoped-slice devices (04-F16) are excluded from hub election and from serving cold-start peers — they cannot satisfy 01-F14. This is a kernel amendment this doc formally proposes against 01 §9.2.
- 04-F5 Revocation (stolen/left-employment phone): back-office revoke cuts cloud and LAN participation at next contact and flags the device branch-wide (01-F25); the local slice is remote-wiped on next app start.

**Tableside capture**
- 04-F6 Order capture to KOT:
  - table pick → compact menu grid (category tabs, search) → modifiers/variants → notes/quick-tags (shared list with doc 02);
  - confirm emits `order.confirmed`; KOTs print via the branch print service (doc 03) with zero waiter-side print configuration;
  - a simple order is ≤ 2 taps from grid to confirm (00 §5.6);
  - lines are persisted locally as events before UI ack (01-F2) — a dying battery never loses a captured order.
- 04-F7 Live availability:
  - `availability.changed` greys items < 1 s over LAN (01-F15) — a waiter never sells a finished karahi;
  - toggling availability from the handheld is a layer-2 permission (default: view only);
  - a toggle mid-capture updates the open cart: already-added unavailable lines get a warning badge, never silent removal.
- 04-F8 Adding lines to an already-confirmed order is a fresh confirm for the new lines only (incremental KOT). Line removal post-confirm requires the void path (01 §4) and escalates to manager/counter — the handheld initiates, never approves.
- 04-F9 Scope discipline: split/merge bills and settlement are **not** on the handheld — the waiter flags `needs-bill` and the counter (doc 02) settles. Move-table is allowed (`order.table_assigned`).

**Table states**
- 04-F10 Table state machine, emitted as `table.state_changed` with actor:
  - `available` — free to seat;
  - `seated` — guests at the table, nothing ordered yet;
  - `ordered` — at least one confirmed order open;
  - `served` — all lines served;
  - `needs-bill` — guests asked to pay; surfaces at the counter (doc 02) and console (doc 05);
  - `cleaning` — settled, being turned over.
- 04-F11 Transitions are side-effects wherever possible (automation law, 00 §5.8): first `order.confirmed` on the table → `ordered`; all lines `served` → `served`; settlement at the counter → `cleaning`. Manual taps exist only for `seated`, `needs-bill`, and `cleaning`-done.
- 04-F12 The handheld shows the branch table map with states and own-section highlighting; doc 05 floor state and doc 02 render the same fold (one fold, three renderers).
  - Concurrent opens of one physical table follow 01-F19: both orders stand, the table shows a conflict badge, staff merge or reassign — nothing auto-discarded.
  - The conflict badge renders on every surface showing the table, not just the devices involved.

**Ready notifications**
- 04-F13 Ready notifications, scoped to the waiter's own tables:
  - when a line/order for one of the waiter's tables becomes `ready` (doc 03), the device notifies (sound + banner) within 2 s over LAN;
  - "own tables" = tables where this waiter created the order, plus any section assigned to them (layer-2 section assignment);
  - the waiter also sees live line progress for their tables (`in_prep` / `ready` per line, folded from `order.line_state_changed`) — the "where's my naan" glance without walking to the pass;
  - notifications dedupe per order: one chime on the first ready line, badge updates after.
- 04-F14 If ready-signal ownership (03-F24) is `waiter-on-pickup`, the pickup action on the handheld emits `order.line_state_changed` → `ready`; delivering to the table is one further tap → `served`. Under any other ownership the waiter only marks `served`.

**Quoted ETA**
- 04-F15 Once doc 03 publishes confident estimates (`eta.estimates_published`), the capture screen shows the order-level quote (03-F29 rule) so the waiter can tell the table "about 25 minutes". Below the confidence gate the field shows nothing — no fabricated estimate, ever (concept law 6).

**Scoped sync slice (design proposal answering 01 §9.2)**
- 04-F16 A handheld may run a **scoped slice** instead of the full branch window (01-F14). Default: BYOD → scoped, restaurant-owned → org choice. The slice contains:
  - reference data: catalog, availability, quick-tags, ETA estimates, the device's permitted user credential hashes;
  - branch-wide: table map states (`table.state_changed` only — tiny);
  - full event detail only for orders this device created or on tables in the waiter's section, current business day only.
- 04-F17 Excluded from the scoped slice by design (privacy + storage):
  - payment and cash events;
  - shift/day events;
  - other waiters' order detail;
  - the customer file;
  - any pre-today history.
  Filtering is enforced server- and hub-side (01-F27) — the client never merely hides the data.
- 04-F18 A scoped device that loses its slice (reinstall, cache purge) re-syncs from hub or cloud in < 60 s on branch Wi-Fi — small by construction. Section reassignment mid-shift triggers slice backfill for the gained tables.

## 4. Key flows

**Seat → order → serve (happy path)**
1. Waiter marks table seated → captures 3 items with modifiers + a note → confirm → KOT prints at stations < 2 s → table auto-flips to `ordered`.
2. Kitchen bumps; pass assembles ("2 of 3 ready…"); order marked ready → waiter's phone chimes, names the table → waiter picks up, taps served → table `served`.
3. Guests ask for the bill → waiter taps needs-bill → counter POS surfaces it, settles, prints the receipt → table flips `cleaning` → busser taps done → `available`.

**WAN down, LAN up**
1. Internet dies mid-rush → the handheld keeps capturing over the LAN mesh (00 §5.1).
2. Availability toggles and ready notifications keep flowing peer-to-hub (01-F15); staff notice nothing.
3. WAN returns → the hub drains the branch outbox to cloud (01-F8); no waiter-visible catch-up state.

**BYOD onboarding**
1. Manager generates a pairing code (doc 14) → waiter installs the app, enters the code → device registers class `handheld`, scoped slice on → waiter sets PIN → taking orders within 10 minutes.
2. Offboarding: back-office revoke → device loses LAN + cloud on next contact, slice wiped (04-F5).

**Void initiated tableside (failure-path discipline)**
1. Wrong item discovered after KOT → waiter requests void with reason → escalation to manager console (doc 05) or counter PIN (doc 02) → on `approval.granted`, `void.recorded` lands and the handheld reflects it. The handheld itself never approves.

**Availability race**
1. Two tables order the last karahi from two handhelds while partitioned from each other → both confirms stand (01-F16/F17 spirit: never block a sale on state math) → kitchen 86es one → item toggled off → one table gets an apology, the ledger gets the truth.

## 5. Data

- **Materialized (device, scoped):** own/section open orders + lines, branch table map, availability set, ETA cache, own-attribution day summary (my tables, my items — the waiter's "I'm clean" view).
- **Emitted:**
  - `order.created / line_added / line_removed / confirmed / note_added / table_assigned`
  - `order.line_state_changed` (`ready` per 04-F14, `served`)
  - `table.state_changed`
  - `availability.changed` (if permitted)
  - `audit.*`
- **Extensions to 01 §4 introduced by this doc:** `table.state_changed` (consumers: doc 05 floor state, doc 02 table view).
- **Consumed:** `availability.changed`, `order.line_state_changed`, `order.confirmed`, settlement state on own tables (as table-state transitions, not payment detail), `eta.estimates_published`.

## 6. Non-functional requirements (module-specific)

- 04-N1 Footprint budgets on a 2 GB Android 10 device (CI-gated against the reference phone, 00 §4):
  - APK ≤ 40 MB, installed ≤ 120 MB;
  - scoped-slice data ≤ 100 MB;
  - steady-state RAM ≤ 250 MB.
- 04-N2 Cold start ≤ 4 s to an unlocked capture screen on the low-end reference phone — tighter than the 6 s POS budget, because waiters open the app mid-conversation at the table.
- 04-N3 Ready-notification latency ≤ 2 s on LAN; capture-to-KOT inherits 00 §5.3 unchanged.
- 04-N4 Battery: a full 8-hour shift of typical duty (screen-off LAN subscription between uses) consumes ≤ 15% on the reference phone — no persistent wake locks.
- 04-N5 All of the above hold with the branch WAN down (00 §5.1).

## 7. Customizability

- **Layer 2 (org):**
  - section assignments;
  - whether waiters may toggle availability;
  - whether BYOD is permitted at all; BYOD single-credential lock (04-F2);
  - scoped-vs-full slice for restaurant-owned handhelds;
  - ready ownership (defined in doc 03);
  - quick-tag list (shared with doc 02).
- **Layer 3 (device):** language, grid density (compact/large), notification tone.
- **Deliberately not configurable:** widening a BYOD scoped slice to include payment/cash/customer data (never); waiter-side settlement or approval powers; attribution; the table state set (fixed vocabulary — presets, not knobs).

## 8. Tech notes

- Expo + Hermes + `op-sqlite`; dependency budget enforced in CI (bundle-size gate) — this app stays small as a feature, not an accident.
- `packages/sync-client` grows a slice-filter parameter (subscription predicate evaluated server/hub-side) — the single kernel change this module needs (04-F4, 04-F17).
- In-branch notifications ride the LAN socket (no FCM dependency on-site); FCM only as a wake-up assist when Android parks the socket in Doze.
- Distribution: Play Store + EAS update channels (doc 15); BYOD phones follow the staged-rollout rules — never force-update during service hours.
- Table map fold is shared code with docs 02/05 (`packages/domain`) — one fold, three renderers.

## 9. Open questions

1. Formal kernel amendment for the scoped slice (01 §9.2): slice predicate shape, hub-side filter enforcement cost, and backfill semantics on section reassignment.
2. Captain mode: multi-waiter section oversight and table transfer between waiters — pull from T3 pilot demand.
3. Tip capture: attribution exists; whether tips are recorded per order at settlement (doc 02) or declared per shift (doc 11) is undecided.
4. iOS BYOD support — out of scope for the fleet, but some captains carry iPhones; revisit after Wave 4 pilots.
5. Whether the handheld should show the guest-facing storefront QR (doc 06) for at-table self-service handoff — a channel question, parked with doc 06.
6. Whether ready notifications should escalate (re-chime) when food sits at the pass past a threshold — or whether that is doc 05's alarm territory.
