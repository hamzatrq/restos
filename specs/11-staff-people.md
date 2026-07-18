# 11 — Staff & People

**Module spec — Draft 1, July 2026** · Parent: `00-platform-overview.md` (conventions §5–§7 inherited), `01-kernel-sync.md` (auth/PIN sessions, event contracts). Concept doc §4.5 (people plane) and §5 (payroll computation explicitly out). Wave 3.

## 1. Purpose & scope

The people plane: attendance, the advances/baqaya ledger, basic shift scheduling, and restaurant memory (opening/closing checklists, shift handover notes, SOP/recipe-card storage — the restaurant survives any one person leaving).

- **Explicitly not:** salary computation or payroll processing (export only — concept doc §5), HR workflows, hiring, biometric identification.
- **Who uses it:** every staff member (clock-in/out, own record self-view), branch manager (schedules, checklist oversight, handovers), owner (ledger, exports, completion visibility via docs 12/14), external accountant (CSV exports).
- **Runs on:** cloud service + surfaces embedded in existing branch devices (POS doc 02, pass/KDS doc 03, manager console doc 05 — no separate staff app) + back office (doc 14) + owner app (doc 12).
- **Tiers/profiles:** all tiers, all profiles.
- **Framing (v1 §2, binding):** every feature doubles as protection *for* the staff member — attendance provable, advance balance provable, "I completed my checklist" provable. This is the adoption unlock.

## 2. Position in platform

- **Events consumed:** kernel PIN sessions (01-F26/F28 — attendance rides on them), `shift.opened / closed`, `day.opened / closed`, `cash.paid_out` (drawer-sourced advances).
- **Events emitted:** `staff.clocked_in / clocked_out / advance_recorded / advance_repaid` (01 §4) plus extensions in §5.
- **Serves:** doc 05 (checklist state, overtime and missed-clock-out alarms), doc 12 (attendance/advances/memory views), doc 13 (labor signals for the nightly brief), doc 14 (templates, schedule editing, exports).
- **Reference data:** checklist templates, shift presets, schedules, and SOP documents distribute to devices over the kernel reference-data channel (01 §8) — one replication path.

## 3. Functional requirements

**Attendance**
- 11-F1 Clock-in/out by PIN on any branch device. The first PIN unlock inside a scheduled shift window prompts a one-tap clock-in; an explicit clock tile is always available. *(Automation law: side-effect of the PIN session staff already use.)*
- 11-F2 Optional selfie at clock-in/out (org setting): a camera capture attached as evidence to the event. No face recognition — the photo is human-checkable evidence, not biometrics. If enabled it is required; a camera-failure skip is allowed but flagged.
- 11-F3 Fully offline-safe: clock events persist locally and sync later (00 §5.1–5.2); the staff member sees immediate confirmation.
- 11-F4 Overtime flag: actual clocked span exceeding the scheduled shift length plus a configured threshold is flagged in the read model and surfaced to docs 05/12. Derived — no data entry.
- 11-F5 Missed clock-out: auto-closed at `day.closed` with an `auto_closed` flag; manager confirmation next day is an append-only correction event; habitual misses are flagged per staff member.
- 11-F6 Self-view: after PIN unlock, any staff member can see their own attendance record and advance balance. Always on — not configurable (protection framing is platform law here).
- 11-F7 Payroll **export only**: CSV per period per branch — days present, shifts worked, flagged overtime spans, advances taken/repaid, outstanding balance. No wage rates, no salary math; the accountant computes pay. Salary computation is deliberately out of scope.

**Advances / baqaya ledger**
- 11-F8 An advance is recorded on-device with dual attribution in one flow: the granting role (per permission matrix) confirms, then the receiving staff member acknowledges with their own PIN. No advance exists without the staff acknowledgment — the on-device dual confirm *is* the hand-over. *(Side-effect of the cash hand-over both parties are performing anyway.)*
- 11-F9 Drawer-sourced advances ride `cash.paid_out` with category `staff_advance`, automatically linking a `staff.advance_recorded` — one action writes both the cash ledger and the staff ledger. *(Side-effect.)*
- 11-F10 Optional repayment schedule (amount per pay period). Repayments are recorded during the payroll-export ritual: the system proposes scheduled deductions, the owner confirms → `staff.advance_repaid`; the staff member is asked to acknowledge at their next PIN session (pending-acknowledgment badge → `staff.advance_acknowledged`). *(Scheduled verified ritual.)*
- 11-F11 Running balance per staff member, visible to the owner **and** to the staff member themselves ("my balance is provable"). Ledger is append-only; disputes create correction events carrying both parties' acknowledgments; history is never rewritten.

**Scheduling (basic)**
- 11-F12 Weekly schedule grid: staff × day × shift preset; week templates copy forward; publishing is explicit → `staff.schedule_published` (versioned; republish supersedes, prior versions retained).
- 11-F13 Staff see their own upcoming shifts on any branch device after PIN unlock; entries changed since last view are marked.
- 11-F14 A schedule is a plan (configuration), never an attendance fact — facts come only from clock events (11-F1). Deliberately absent: availability bidding, shift-swap marketplace, labor-cost optimization.

**Restaurant memory**
- 11-F15 Opening/closing checklists: per-branch templates (org-defined via doc 14); items are icon + short text; per-item check-off with optional photo proof (template marks which items require a photo) → `checklist.item_checked`, `checklist.completed`. Item checks ride the LAN fast path to the manager console. *(Scheduled verified ritual — the photo is the verification.)*
- 11-F16 Completion state visible to manager/owner (docs 05/12). `day.closed` with an incomplete opening/closing checklist is flagged, never blocked.
- 11-F17 Shift handover note at shift close, structured: cash handed over (prefilled from the shift-close expected/counted figures — never re-typed), pending issues (quick-tags + optional text or voice note), stock notes (quick-tags). Attached to the `shift.closed` event → `handover.recorded`. *(Side-effect of the shift-close ritual that already happens.)*
- 11-F18 SOP/recipe-card storage: versioned reference documents (PDF, images, short text) uploaded via back office; view-only on branch devices, organized by station; distributed over the reference-data channel. Not a data capture — reference distribution only.
- 11-F19 Low-literacy design (tightens 00 §5.6): every staff-facing action ≤ 3 taps, icon-led, English labels kept short and paired with icons; wherever free text exists, a voice-note alternative exists.

**Automation-law register (00 §5.8)** — every capture in this module, classified:

| Capture | Class |
|---|---|
| Clock-in/out | side-effect (PIN session) |
| Selfie | verification evidence on the side-effect |
| Advance recorded | side-effect (dual-PIN cash hand-over; or `cash.paid_out`) |
| Advance repaid | scheduled verified ritual (payroll-export ritual) |
| Checklist completion | scheduled verified ritual (photo-verified) |
| Handover note | side-effect (of shift close) |
| Overtime flags | derived, no capture |
| Schedules, templates, SOPs | configuration/reference data, not facts |

No discretionary data entry is introduced.

## 4. Key flows

**Flow A — Morning clock-in**
1. Staff member unlocks any branch device with their PIN (the session they already need to work).
2. Inside a scheduled shift window, the device prompts "Clock in?" — one tap; selfie captured if org-enabled.
3. `staff.clocked_in` persists locally before the confirmation shows (01-F2); syncs whenever connectivity allows.
4. *Offline:* identical experience; event syncs later.
5. *Camera dead:* selfie skip recorded with a flag; manager sees the flagged entry — service is never blocked.
6. *Forgot entirely:* no clock event exists; the schedule shows the absence; the manager records a correction event next day if warranted (append-only, attributed).

**Flow B — Advance from the drawer**
1. Manager starts a paid-out (doc 02) and picks category `staff_advance`.
2. Selects staff member + amount (+ optional repayment plan); confirms with manager PIN.
3. Device is handed to the staff member, who sees the amount (large numerals) and acknowledges with their own PIN.
4. `cash.paid_out` + linked `staff.advance_recorded` written together; both ledgers update; both parties can see it forever.
5. *Refusal:* staff declines to acknowledge → nothing is recorded; the flow cannot complete one-sided.
6. *Advance outside the drawer* (owner's pocket): same dual-PIN flow started from the advances screen, without the `cash.paid_out` leg.

**Flow C — Payroll export (monthly ritual)**
1. Owner opens the export in doc 12/14 and picks the period.
2. Per-staff summary shown: days present, shifts, flagged overtime spans, advances taken, outstanding balance.
3. System proposes scheduled deductions from repayment plans; owner confirms or adjusts per staff member.
4. `staff.advance_repaid` events written; CSV generated and delivered (signed URL) for the accountant.
5. Each affected staff member gets a pending-acknowledgment badge at next PIN session → `staff.advance_acknowledged`.
6. *Dispute:* staff declines acknowledgment → dispute flag raised to owner; resolution is a correction event carrying both acknowledgments (11-F11).

**Flow D — Opening checklist**
1. Opener unlocks a device; today's opening checklist is the first tile.
2. Items checked one by one; photo captured where the template requires it.
3. Each `checklist.item_checked` streams to the manager console over the LAN fast path.
4. All items done → `checklist.completed`; gaps remain visible to manager/owner in real time.
5. *Not completed by open:* flagged on doc 05/12; never blocks opening the day.

**Flow E — Shift handover**
1. Cashier runs the normal shift close (doc 02); the handover form appears with cash figures prefilled from the close.
2. Pending issues added as quick-tags (+ optional text or voice note); stock notes as quick-tags.
3. `handover.recorded` attached to `shift.closed`.
4. The next shift's first PIN unlock on that station shows the handover note before anything else.

**Flow F — Schedule publish**
1. Manager copies last week's template in doc 05/14 and edits.
2. Explicit publish → `staff.schedule_published`; schedule distributes as reference data.
3. Staff devices show each person their own upcoming shifts; changed entries are marked.
4. *Unpublished edits* are invisible to staff — there is no half-published state.

## 5. Data

- **Entities owned (cloud read models, rebuildable per 01-F7):** `attendance_records` (folded from clock events), `advance_ledger` (running balances), `schedules` + `shift_presets`, `checklist_templates` + `checklist_runs`, `handover_notes`, `sop_documents` (metadata; files in object storage), `payroll_exports` (generated artifacts).
- **Events emitted (from 01 §4):** `staff.clocked_in / clocked_out / advance_recorded / advance_repaid`.
- **Events added to the 01 §4 catalog by this spec:** `staff.schedule_published`, `staff.advance_acknowledged`, `checklist.item_checked`, `checklist.completed`, `handover.recorded`.
- **Events consumed:** `cash.paid_out`, `shift.opened/closed`, `day.opened/closed`, PIN session context (01-F26).
- Selfie/checklist photos: object storage, compressed, refs on events; retention per §9.

## 6. Non-functional requirements

Cross-cutting NFRs inherited from 00 §5. Module-specific:

- 11-N1 Clock-in ≤ 5 s end-to-end including selfie on reference hardware; ≤ 3 taps.
- 11-N2 Selfie/checklist photos compressed client-side ≤ 150 KB; capture never blocked by connectivity; deferred upload.
- 11-N3 Payroll export generated < 10 s per branch-month.
- 11-N4 Checklist item checks and clock events reach the in-branch manager console over the LAN fast path < 1 s (00 §5.3).
- 11-N5 SOP cache on branch devices capped at 100 MB, LRU-evicted, outside the kernel budget of 01-N3.
- 11-N6 Advance-balance query on owner app and staff self-view served from local/cached read model < 1 s.

## 7. Customizability

- **Layer 1 (platform admin):** module feature flag (Wave 3 staged rollout).
- **Layer 2 (org):** shift presets and lengths; overtime threshold; selfie on/off; advance-granting roles and per-role advance cap without owner approval; default repayment fraction; checklist templates incl. photo-required items; handover and stock quick-tag sets.
- **Layer 3 (branch/device):** preferred attendance surface per branch; language (00 §5.6); checklist template assignment per branch.
- **Deliberately not configurable:** staff self-view of own attendance and balance (always on); the dual-PIN requirement on advances; append-only ledger; absence of salary computation; schedules never auto-create attendance facts.

## 8. Tech notes

- Backend `people` module in the modular Node backend; read models Postgres/Drizzle; no new apps — surfaces are screens inside docs 02/03/05 hosts, reusing the existing PIN session identity (01-F26), so there is no second login system.
- Camera: RN vision-camera on Android hosts, `getUserMedia` on Electron; photos through the same deferred upload queue as doc 10 invoices.
- Voice notes: Opus, 30 s cap, object storage; playback on manager/owner surfaces.
- Schedules/checklist templates ship as reference-data snapshots + deltas (01 §8) — no bespoke sync.
- Exports produced by the jobs service; delivered as signed URLs; CSV schema versioned in `packages/domain`.

## 9. Open questions

1. Staff personal-phone access (view schedule/balance via WhatsApp doc 07 or a thin PWA) — policy, privacy, and template-message cost; branch-device-only is the shipped baseline.
2. Whether wage rates ever enter the system to power labor-cost % on branch comparison (v1 §3.2 B4 mentions it) — tension with the no-salary-computation stance; decide together with a future accountant workspace.
3. Advance dispute flow depth — is a two-party correction event enough, or is an owner-mediated resolution screen needed?
4. Selfie retention period — evidence value vs privacy and storage (default proposal: 90 days, then thumbnail only).
5. Schedule-change notifications to staff personal numbers (WhatsApp template cost) vs on-device-only.
