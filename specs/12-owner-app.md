# 12 — Owner App

**Module spec — Draft 1, July 2026** · Parent: `00-platform-overview.md` (conventions §5–§7 inherited). References: `01-kernel-sync.md` (events, auth), `13-intelligence.md` (brief/alerts/analyst brains), `07-whatsapp-channel.md` (companion surface), `10-inventory-supply.md` (stock variance source), `14-backoffice.md` (where all thresholds are configured), `restaurant-os.md` Appendix C (dashboard seed). **Wave 1 basic · Wave 4 full.**

## 1. Purpose & scope

The owner app is the owner's window into the whole business from their phone: live state, the nightly summary, exception alerts, a deliberately small set of reports, multi-branch roll-up, and the conversational analyst surface. React Native (Expo), **Android + iOS** — owners often carry iPhones even when the shop runs PKR 25k Android hardware. All tiers and profiles get it; a single-branch owner sees one branch tile, a 5-branch org sees identical tiles plus a roll-up.

The app is cloud-fed: it reads cloud read models over the api-gateway and is **not** a branch-LAN participant. It degrades honestly when a branch is offline (00 §5.1, §5.7).

**Read-only by design (module law):** the owner app never mutates operational data. Its only writes are alert acknowledgements and analyst chat messages. Configuration lives in the back office (doc 14); floor actions in the manager console (doc 05); autonomy-ladder approvals surface in manager console / back office / WhatsApp (doc 13) — the owner app links out to them.

Wave 1 slice: nightly auto-summary + live view. Wave 4: exception alerts, reports + exports, full multi-branch drill-in, embedded analyst chat.

## 2. Position in platform

- **Depends on:** api-gateway (tRPC) read models fed by the merged ledger (01-F7); intelligence service (doc 13) for brief content, `alert.raised` events, and analyst answers; FCM + APNs push (00 §3); export jobs (BullMQ) + S3 signed URLs.
- **Read models consumed** are folds over:
  - `order.*`, `payment.recorded`, `kot.printed` (sales, ticker, hourly curve);
  - `void.recorded`, `comp.recorded`, `discount.recorded` (attribution blocks and alerts);
  - `shift.opened/closed`, `day.opened/closed`, `cash.drawer_opened/paid_out/deposit_recorded` (cash blocks);
  - `stock.purchase_recorded/wastage_recorded/count_recorded` (purchases, wastage, variance).
- **Consumes (intelligence, doc 13):** `brief.generated`, `alert.raised`, `suggestion.issued` (display only).
- **Emits:** `alert.acknowledged` (extends 01 §4 catalog; owned by doc 13, emitted from this surface), `audit.*` (login, export).
- **Deep links:** the WhatsApp nightly brief (doc 07) links into corresponding app screens; app chips link from cited metrics to report views.

## 3. Functional requirements

**Access & identity**
- 12-F1 The app registers as a personal device bound to a user with owner-scope permissions (01-F25/26); sessions are revocable from back office (doc 14) and platform admin (doc 15).
- 12-F2 All reads are authorized server-side (00 §5.4); the app never widens scope client-side — a user with single-branch scope sees only that branch's tiles and reports.
- 12-F3 A user assigned to multiple orgs picks an org at login and can switch without re-registering; data from two orgs is never blended in one view or one export.
- 12-F4 Optional biometric/PIN app lock (device-layer setting); nothing beyond opted-in headline numbers appears on the OS lock screen.

**Live view (W1)**
- 12-F5 Today ticker per branch: sales total (PKR, thousands separators), order count, by channel (dine-in / takeaway / own delivery / foodpanda / storefront / WhatsApp); refreshes while foregrounded at ≤ 60 s intervals when the branch is online.
- 12-F6 Open orders count and open tables count per branch (tables only where the tier has a table map).
- 12-F7 Per-branch tiles with identical structure for one-glance comparison; tap drills into the branch.
- 12-F8 **Sync honesty (00 §5.7):** every tile shows last-synced age whenever the branch's newest cloud-received event is older than 60 s ("last synced 22 min ago"). An offline branch is visually distinct; stale data is never presented as live. This display is not configurable.

**Nightly auto-summary (W1)**
- 12-F9 A push notification is delivered per business day per branch (plus org roll-up when >1 branch), triggered by `day.closed`, or at a hard deadline (org-configurable, default 23:30) with an explicit "day not closed yet — figures provisional" banner.
- 12-F10 Summary content (`restaurant-os.md` Appendix C), each block independently renderable and testable:
  - sales total & order count by channel;
  - cash expected vs counted per cashier, with over/short highlighted;
  - voids, comps, discounts — count, value, and by whom;
  - top 5 items by revenue;
  - hourly sales curve;
  - purchases logged today (value) and wastage logged (value + entry count).
- 12-F11 One-line gross-margin signal when recipe data exists ("Estimated gross margin today: 61%"). When recipe coverage is below the doc 13 precondition (13-F5) the margin line is omitted — never guessed, never shown as zero.
- 12-F12 The narrative text of the summary is the doc 13 nightly brief; all numbers rendered in-app come from the same semantic-layer metrics the brief cites, so brief and screen can never disagree.
- 12-F13 Summary history is browsable by calendar date; past summaries render from stored values, never recomputed, so history is stable even after read-model rebuilds.

**Exception alerts (in-app inbox W4; delivery from W1 per 13-F14a)**
- 12-F14a Before the Wave 4 inbox ships, `alert.raised` events still reach the owner: every class appears in the nightly summary's "what's odd" block from Wave 1, and critical classes push immediately via WhatsApp utility templates from Wave 2 (13-F14a). No alert class ever fires with no delivery surface.
- 12-F14 The app receives and displays pushes for doc 13 `alert.raised` events, covering at minimum these classes:
  - void/comp spike in a shift;
  - discount anomaly vs the cashier's own baseline;
  - cash variance beyond threshold at shift close;
  - stock variance after a physical count (doc 10);
  - supplier price spike on a purchase;
  - no-sale drawer opens above threshold.
- 12-F15 Thresholds are org-configurable with sane defaults — configured in doc 14, never in this app; each alert states which threshold or baseline fired.
- 12-F16 Each alert shows its evidence: cited metric values, entities involved (cashier/item/branch), time window, and a deep link to the underlying report or event list.
- 12-F17 Acknowledging an alert emits `alert.acknowledged` (actor, timestamp) — the app's only operational write. Acknowledged state syncs across surfaces: an alert acked in-app stops re-nagging on WhatsApp and vice versa.
- 12-F18 Alerts respect org quiet hours (doc 14 setting) except classes marked critical (e.g. cash variance above the critical threshold); deferred alerts deliver at quiet-hours end. An alert inbox lists open and acknowledged alerts with filters by class and branch.

**Reports & exports (W4)**
- 12-F19 Reports are deliberately few (`restaurant-os.md` Appendix C) — exactly three at launch:
  - **item profitability** — revenue, theoretical food cost, margin per item; items without recipe data show "no recipe" rather than a fabricated cost;
  - **branch comparison** — branches side by side, identical columns (sales, food cost %, variance, voids/comps);
  - **channel economics** — per channel, net of commission % and own-channel take-rate, using the org's configured rates (docs 14/15).
- 12-F20 Every report exports to Excel/CSV/PDF; generation is server-side (job + signed URL) and shares via the OS share sheet; exports carry the org name, period, and generation timestamp.
- 12-F21 Every displayed figure resolves to a semantic-layer metric id (doc 13); the analyst citing the same metric returns the identical value for the identical period — one number, everywhere.

**Multi-branch (roll-up W1 · full W4)**
- 12-F22 Org roll-up totals with drill-in per branch; the branch view inside the roll-up is identical to the single-branch view (structure never changes with org size).

**People & staff (W3, read-only — the doc 11 owner surface)**
- 12-F27 Advances/baqaya: per-staff running balance list with drill-in to full advance/repayment history (doc 11 ledger). Read-only — advances and acknowledgments happen on branch devices (11); the app renders, never records.
- 12-F28 Attendance glance: today's clock-ins/absences, overtime flags, and a month view per staff member; payroll-export trigger deep-links to doc 14.
- 12-F29 Checklist & handover visibility: opening/closing completion state on the live view; the nightly summary gains a people block at W3 (checklist completion, attendance exceptions, advances issued today — extends 12-F10).

**Analyst chat (W4)**
- 12-F23 Embedded chat surface: free-text questions (English or roman-Urdu mix accepted as input; answers always English — doc 13); brains entirely in doc 13 — this module specs only the UI: message list, streaming answer display, cited metric values rendered as tappable chips deep-linking to report views.
- 12-F24 "Not enough data yet" answers render as-is with the reason returned by doc 13; the UI never re-words a refusal into a number.
- 12-F25 Conversation memory is per owner and shared with the WhatsApp surface (one thread of context, two surfaces — doc 13); history is visible in-app.

**Read-only law**
- 12-F26 No screen in this app offers creation, edit, or deletion of operational or configuration data. Suggested actions from the intelligence plane render read-only with a link-out to the approving surface. Automated tests assert the app's API client has no mutating endpoints beyond `alert.acknowledged`, chat messages, and its own device/session lifecycle.

## 4. Key flows

**Nightly summary (happy path)**
1. Branch manager closes the day → `day.closed` syncs to cloud.
2. Doc 13 computes the metric set and generates the brief (`brief.generated`).
3. Push lands on the owner's phone (and WhatsApp per doc 07).
4. Tap opens the summary screen rendered from stored metric values; links drill into the hourly curve or cashier detail.

**Nightly summary (failure paths)**
- Day never closed → deadline push fires with the "provisional" banner (12-F9); the final summary regenerates after the late `day.closed`.
- Branch offline all evening → summary generates from events received so far, explicitly marked "through 21:40 — branch offline since"; a corrected summary follows sync catch-up.

**Alert lifecycle**
1. Doc 13 emits `alert.raised` → push visible < 2 min (12-N2).
2. Owner opens the evidence view, drills into the linked report.
3. Owner acknowledges → `alert.acknowledged` syncs → WhatsApp nag suppressed.
4. Unacknowledged critical alerts re-notify once after 30 min, then fold into the next brief's "what's odd".

**Offline branch honesty**
1. Branch WAN drops → cloud read models stop advancing.
2. Tiles show growing last-synced age; the branch tile is marked offline; ticker figures freeze with their age label.
3. On reconnect, catch-up sync (01-F9) refreshes tiles. No interpolation or projection is ever shown.

**Analyst question**
1. Owner types "aj Tuesday se kam kyun?".
2. App streams the doc 13 answer; cited chips render (e.g. `sales.total` today vs trailing 4 Tuesdays).
3. Tapping a chip opens the report view scoped to that metric and period.

**Export**
1. Owner picks report + period + format → server job renders → push/in-app link with signed URL → OS share sheet.
2. Failure: job errors → in-app notice with retry; no partial files are ever delivered.

## 5. Data

- **Device (SQLite, op-sqlite):** cached read-model snapshots per screen (with as-of timestamp powering 12-F8); summary history; alert list + ack state; chat transcript cache; pending acknowledgements as an **offline request queue against an idempotent tRPC endpoint** (keyed by alert id — retries harmless). The owner app stays on the cloud plane (18 §6): it does NOT run `sync-client` and has no kernel outbox; the server emits `alert.acknowledged` into the ledger on the owner's behalf.
- **Cloud:** no entities owned. Alert and brief read models are owned by doc 13; report aggregates by doc 01 read models; export job records by the jobs service.
- **Events emitted:** `alert.acknowledged`, `audit.login`, `audit.export_requested`.
- **Events consumed:** listed in §2 (via read models, not raw stream subscription).

## 6. Non-functional requirements (module-specific)

- 12-N1 Cached dashboard load < 2 s (00 §5.3); cold-cache load on 4G < 5 s.
- 12-N2 Nightly summary push delivered within 5 min of `brief.generated` for 95% of deliveries; alert push visible p95 < 2 min from `alert.raised`.
- 12-N3 Fully offline (owner in an airplane): every previously viewed screen renders from cache with its age label; the app never shows a blank or spinner-forever state.
- 12-N4 Battery: background refresh ≤ 4 scheduled fetches/day beyond push-driven wakes.

## 7. Customizability

- **Layer 2 (back office, doc 14):** summary deadline time; alert thresholds and baseline sensitivity; quiet hours + critical-class exemptions; which users hold owner-scope; commission % per channel (feeds the channel-economics report, 12-F19).
- **Layer 3 (device):** biometric lock; notification granularity (headline numbers on lock screen: on/off).
- **Deliberately not configurable:** sync-age honesty display (12-F8); read-only design (12-F26); the report set — no custom report builder, no owner-defined metrics (metrics change only via the doc 13 registry); append-only history.

## 8. Tech notes

- Expo + EAS builds (00 §3); `op-sqlite` cache; FCM (Android) + APNs (iOS).
- Push payloads carry only ids + headline text — content is fetched on open, so a stale push can never show outdated figures.
- Charts: `victory-native` (18 §14 registry) for the hourly curve and sparklines; no heavier charting dependency.
- Deep-link scheme `restos-owner://` shared with WhatsApp brief links (doc 07) and analyst citation chips.
- Exports rendered server-side — one renderer serves this app and doc 14's desk views; the app only downloads.
- Maestro flows in CI: summary open, alert ack, offline-cache render, org switch, export share.

## 9. Open questions

1. Whether the owner app shows a read-only feed of autonomy-ladder actions (doc 13 rungs 3–4) in W4, or that stays manager-console-only until pilots ask for it.
2. Lock-screen headline numbers: default on or off for privacy (owner phones get handed around).
3. Whether branch comparison should cap at 5 branches per phone screen and paginate beyond.
4. OTP vs back-office-issued pairing code for first registration of a personal owner device.
