# 16 — Tax Module (FBR/PRA Compliance Add-on)

**Module spec — Draft 1, July 2026** · Parent: `00-platform-overview.md` (conventions §5–§7 inherited), `01-kernel-sync.md` (event contracts). v1 reference detail: `../restaurant-os-spec.md` §3.5 (Module E) — carried over unchanged unless amended here. Wave: on demand (built when the first documented customer commits; posture engine ships earlier with doc 02).

## 1. Purpose & scope

Two distinct jobs on one module boundary:

1. **Tax posture engine** (all orgs, free): what tax the system charges and prints, configured per channel and per payment method. Off by default. Internal "true" numbers are always complete regardless of external reporting posture — decisions are never made on partial data.
2. **Compliance add-on** (paid, per org): when enabled, fully faithful — real-time invoice fiscalization to FBR IMS + PRA e-invoicing, FBR invoice number + QR on the receipt, correct rate handling, store-and-forward for offline periods, returns-ready reports.

- **Who uses it:** owner (posture configuration via doc 14), platform admin (rule packs, enablement, fiscal fleet health via doc 15), external accountant (return exports). Staff never interact with it — fiscalization is invisible at the counter.
- **Runs on:** `services/tax` (cloud) + a POS-side fiscal queue component inside doc 02 hosts + receipt-pipeline integration in doc 03.
- **Tiers/profiles:** all; orthogonal to hardware tier.

**Legal red line (v1 §3.5, verbatim and binding):** "the product never implements sales suppression, dual-billing, or under-reporting mechanics in the compliant path, and never markets concealment as a feature." Tax-optional means the owner controls what the system charges and reports; the compliant module, when on, is honest end-to-end.

## 2. Position in platform

- **Events consumed:** `payment.recorded / split_recorded`, `order.created / channel_tagged`, `void.recorded`, `comp.recorded`, `discount.recorded` (credit-note triggers), `config.changed` (posture/rule-pack changes).
- **Events emitted:** `fiscal.*` family — added to the 01 §4 catalog by this spec (§5).
- **Integrates:** doc 02 (settlement path hosts the synchronous attempt + local queue), doc 03 (receipt blocks: FBR invoice number + QR render), doc 12 (tax summaries for the owner), doc 14 (posture matrix UI, needs-review queue), doc 15 (add-on enablement, credential provisioning, fiscal fleet health).
- **External:** FBR IMS API, PRA e-invoicing API (REST — permitted third-party exception per 00 §3). Infra: BullMQ store-and-forward queue (00 §3) + local SQLite queue on POS.

## 3. Functional requirements

**Posture (always present)**
- 16-F1 Tax is off by default. Enabling any posture or the add-on is an explicit org action recorded as `config.changed` (audited, 01-F5).
- 16-F2 Posture matrix per channel × payment method: `none | inclusive | exclusive`, each referencing a rate from a rule pack. Rates are never free-typed by orgs. Illustrative matrix (an org's choice, not a default):

| | Cash | Card/digital | Credit (khata) |
|---|---|---|---|
| Dine-in | exclusive @ PRA-cash | exclusive @ PRA-card | exclusive @ PRA-cash |
| Storefront/WhatsApp | none | exclusive @ PRA-card | — |
| Foodpanda | per aggregator invoicing | per aggregator invoicing | — |
- 16-F3 Internal true numbers always complete: every order records full value, channel, and payment method regardless of posture; reports and intelligence (docs 12/13) always operate on the complete ledger.
- 16-F4 All rates and rules live in vendor-maintained, versioned **rule packs** with effective dates (e.g. Punjab pack: PRA 16% cash / 8% card-digital under the Punjab Finance Act 2025). All rates/rules are configuration, verified against current notifications at build time; rule-pack updates are `config.changed` events and never rewrite past invoices.
- 16-F5 Tax is computed per line at settlement and snapshotted on the order (01-F18 discipline — never re-derived); integer paisas; rounding rules per authority spec, fixed at build-time verification.
- 16-F6 Split payments across differently-rated methods: tax apportioned by payment share per method. Provisional rule pending authority guidance (§9.1).

**Fiscalization (add-on on)**
- 16-F7 Every invoice in fiscal scope (per the posture matrix) MUST be fiscalized. There is no per-invoice opt-out, no unfiscalized parallel receipt, and no code path that emits a customer receipt outside the fiscal pipeline while the add-on is active.
- 16-F8 Fiscalization state machine per invoice — states, transitions, and triggers:

| From | To | Trigger |
|---|---|---|
| — | `pending` | fiscal-scope settlement recorded (queue row persisted before receipt prints) |
| `pending` | `submitted` | request sent to authority (sync attempt or queue drain) |
| `submitted` | `acknowledged` | authority returns invoice number (terminal; number + QR payload stored) |
| `submitted` | `failed(n)` | timeout, transport error, or authority rejection (response captured verbatim) |
| `failed(n)` | `submitted` | retry — exponential backoff, capped at 1 h between attempts |
| `failed(N)` | `needs_review` | attempt limit reached (default N = 10) — parked, surfaced in doc 14 |
| `needs_review` | `submitted` | manual retry after resolution (audited action) |

  `acknowledged` is the only success-terminal state; `needs_review` is never terminal — every in-scope invoice must eventually reach `acknowledged` or become a documented credit-note case. Every transition is an event, forming a per-invoice audit trail hash-chained per device (01-F5 pattern).
- 16-F9 Online path: synchronous fiscalization attempt at settlement with a hard timeout (default 2,500 ms, Layer 1). On success the receipt carries the FBR invoice number + QR (doc 03 render).
- 16-F10 Offline/timeout path: the receipt prints immediately (00 §5.3 targets intact) with the local invoice number (USIN) and a "fiscal submission pending" marker; the invoice enters the store-and-forward queue. On acknowledgment the FBR number is available on reprint and on the digital receipt (docs 06/07). Marker format and acceptability verified against FBR technical spec at build time (§9.3).
- 16-F11 Queue durability: the fiscal queue row is persisted in POS SQLite (WAL) before the receipt prints; it survives power loss and app reinstall-with-restore; draining goes POS → cloud tax service → authority; submission is idempotent (invoice id/USIN dedupe). Zero invoice loss, ever.
- 16-F12 Post-fiscalization corrections: void/refund/adjustment after acknowledgment produces a credit note (or debit note) per authority spec, linked to the original invoice → `fiscal.credit_note_issued`. Append-only; the original invoice is never modified or resubmitted.
- 16-F13 Reconciliation: a daily job compares settled fiscal-scope orders against fiscalized invoices per branch; any gap raises `fiscal.reconciliation_gap_flagged` to doc 15 fleet health and the org back office. Target steady state: zero gap.
- 16-F14 Returns-ready reports: monthly export per authority — sales register, tax collected by rate and payment method, credit notes — CSV + PDF, aligned to FBR/PRA return line items.
- 16-F15 `needs_review` queue surfaced in back office (doc 14): resolution actions are retry and annotate; resolutions are audit events; deletion does not exist.
- 16-F16 Credit (khata) orders: the fiscal invoice is issued at receipt issuance (order completion), not at eventual khata settlement; the applicable rate for method-differentiated regimes follows the rule pack's mapping for credit sales (§9.6).
- 16-F17 Owner visibility: doc 12 shows a per-day fiscal health tile when the add-on is on — invoices fiscalized / pending / needs_review — with the same sync-honesty rules as every remote view (00 §5.7).

**Automation-law register (00 §5.8):** tax computation — side-effect of settlement; fiscal submissions — side-effect of the same; authority acknowledgments — ingestion; rule packs and posture — configuration, not facts. This module asks staff to enter nothing.

## 4. Key flows

**Flow A — Enablement**
1. Org commits to the add-on; platform admin enables the flag (doc 15).
2. Org provides its FBR/PRA registration credentials; vendor provisions endpoints + the correct rule pack.
3. A sandbox test invoice round-trips successfully (submission → acknowledgment → QR verify).
4. Owner confirms the posture matrix in doc 14 (which channels/payment methods are in fiscal scope).
5. Go live. Every step above is a `config.changed` / audit event; there is no silent enablement.

**Flow B — Settlement, online (happy path)**
1. Cashier settles the order (doc 02); tax lines computed from the snapshot rules and stored on the order.
2. Fiscal record persisted as `pending` in POS SQLite — before any print.
3. Synchronous submission to the authority with the configured timeout (default 2,500 ms).
4. `acknowledged` within the window → receipt prints with FBR invoice number + QR (doc 03).
5. Added latency ≤ timeout, on the receipt step only — order confirm and KOT timings are untouched (16-N1).

**Flow C — Settlement, offline (8 h WAN cut)**
1. Settle → `pending` persisted; the sync attempt is skipped (link known down).
2. Receipt prints immediately with USIN + "fiscal submission pending" marker.
3. On reconnect, the local queue drains through the cloud tax service in order; each invoice `submitted → acknowledged`.
4. Records updated; reprints and digital receipts (docs 06/07) now carry the FBR numbers.
5. Reconciliation job (16-F13) confirms zero gap for the day.

**Flow D — Failure / poison**
1. Authority rejects an invoice (validation error) → `failed(1)`, response captured verbatim.
2. Retries with backoff; a transient outage self-heals invisibly.
3. Persistent failure hits the attempt limit → `needs_review`, surfaced in doc 14 with the captured cause.
4. Root cause fixed (e.g. credential renewal via doc 15) → manual retry → `acknowledged`.
5. At no point was the customer-facing flow blocked or an invoice lost.

**Flow E — Void after acknowledgment**
1. Manager-PIN void (doc 02) on a fiscalized order.
2. Credit note generated per authority spec, linked to the original invoice, and submitted through the same state machine.
3. `fiscal.credit_note_issued` on acknowledgment; the original invoice is never touched.

**Flow F — Monthly return**
1. Accountant (or owner) pulls the return export for the period from doc 14.
2. Export contains the sales register, tax by rate and payment method, and credit notes — aligned to return line items.
3. Totals reconcile to the event ledger by construction (16-F13); any residual `needs_review` items are listed, not hidden.

## 5. Data

- **Entities owned:** `fiscal_invoices` (org, branch, order ref, USIN, state, attempts[] with request/response digests, authority invoice number, QR payload, rule-pack version), `fiscal_queue` (POS-local SQLite + cloud BullMQ mirror), `rule_packs` (versioned, effective-dated), `return_exports`, `credentials` (per-org authority registration, encrypted).
- **Events added to the 01 §4 catalog by this spec:** `fiscal.invoice_queued / invoice_submitted / invoice_acknowledged / submission_failed / credit_note_issued / reconciliation_gap_flagged`.
- **Events consumed:** listed in §2.
- Read models rebuildable (01-F7) except `fiscal_invoices`, which additionally mirrors authority-issued facts (numbers, timestamps) that must be retained as received.
- **Retention:** fiscal records and attempt logs are retained for the statutory audit period (≥ 6 years — confirm at build time); POS-local queue rows are never compacted before cloud acknowledgment of the drain.

## 6. Non-functional requirements

Cross-cutting NFRs inherited from 00 §5. Module-specific:

- 16-N1 Fiscalization never delays order confirm or KOT print (00 §5.3); only the settlement receipt may wait, and never longer than the configured timeout.
- 16-N2 Queue drain: 500 queued invoices (8 h offline, 01-scale rush) fiscalized < 5 min after reconnect on 4G.
- 16-N3 Clocks: authority submissions carry device time; skew > 5 min is flagged (01-N2) and `server_received_at` is stored alongside for reconciliation.
- 16-N4 Credentials encrypted at rest, org-isolated absolutely (00 §5.4); never present on branch devices — POS-side submission uses short-lived signed tokens minted by the cloud service.
- 16-N5 Authority API outage of any duration causes zero customer-facing degradation beyond the pending marker.
- 16-N6 State transitions are visible in the back-office needs-review/fiscal-health views < 1 min after they occur cloud-side.

## 7. Customizability

- **Layer 1 (platform admin):** add-on enablement per org; rule packs and effective dates; sandbox/live endpoints; sync timeout; retry/backoff policy; needs-review threshold.
- **Layer 2 (org):** posture matrix (channel × payment method); org registration credentials; receipt disclosure text within the doc 03 template bounds.
- **Layer 3 (branch/device):** none.
- **Deliberately not configurable, ever:** skipping fiscalization for in-scope invoices; editing or deleting fiscal history; the state machine; the audit chain; any setting whose effect is under-reporting in the compliant path (see the red line, §1).

## 8. Tech notes

- `services/tax` in the modular Node backend; REST clients for FBR IMS/PRA generated from their current specs with a build-time "regulation verification" checklist gate before first org enablement (v1 §10.4 — rates changed 5%→8% for cards in 2025; assume drift).
- POS-side queue reuses the sync-client outbox pattern (01 §5) — same durability discipline, same tests (plug-pull mid-settlement is a required case in 00 §4 durability suite).
- QR rendering through `packages/escpos` (doc 03 print path); QR payload format per FBR spec.
- Submission topology decision: POS submits directly when online (to get the number onto the first printed receipt), cloud service is the drain path and fallback; final call after sandbox latency measurement (§9.2).
- FBR sandbox wired into the staging environment; rush simulation (00 §4) runs with the add-on enabled to prove 16-N1.
- Rule-pack schema in `packages/domain` (Zod), like all config.

## 9. Open questions

1. Split-payment rate apportionment (16-F6): confirm against PRA guidance; fall back to highest-rate-applies if apportionment is disallowed.
2. Submission topology (POS-direct vs cloud-relay) — decide on sandbox latency data.
3. Legal acceptability of the "fiscal submission pending" receipt marker during offline periods — verify against FBR technical spec and inspection practice before first enablement.
4. Additional authority rule packs (SRB, KPRA, ICT) — trigger and timing; the rule-pack mechanism is designed for them.
5. Whether late-arriving FBR numbers should be proactively delivered to customers via WhatsApp (doc 07) as standard behavior, or only on reprint/digital receipt.
6. Rate treatment of khata (credit) sales under the cash/card-differentiated PRA regime (16-F16) — verify the correct mapping in current notifications.
