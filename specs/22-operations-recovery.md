# 22 — Operations: Backup, Disaster Recovery & Data Governance

**Operations standards — Draft 1, July 2026** · Parent: `00-platform-overview.md` (conventions §5–§7 inherited). Closes the audit P0 finding: the platform selects managed cloud stores (Postgres, Redis, object storage — 00 §3, 18 §4) and permanent event retention (01 §5) but defined no recovery or data-governance requirements. This document is binding on platform engineering the way doc 18 is binding on the codebase.

**Architectural context that shapes everything here:** a cloud outage never stops service — branches bill, print, and coordinate on LAN indefinitely (00 §5.1), and every in-branch device retains the rolling branch event window (01-F14). Recent branch-originated data therefore has a natural device-side second copy; cloud recovery is about the merged org ledger, read models, cloud-originated orders, and the surfaces that ride on them.

## 1. Purpose & scope

Defines: recovery objectives (RPO/RTO), backup mechanics and ownership, restore verification drills, encryption and key custody, regional placement and failover posture, the vendor data-flow map and residency posture, retention/erasure rules over an append-only ledger, org export and platform exit, and account-suspension contingencies. Used by platform engineering (runbooks, drills), platform admin (doc 15 fleet health, legal hold), and org owners (export, erasure requests via doc 14). Applies to every org; nothing here is tier- or profile-dependent.

## 2. Position in platform

- **Depends on:** 01 (ledger, outbox, idempotent push 01-F8, rolling window 01-F14), 15 (fleet-health alert surface), 20 §4.2 (Auditor refold — the restore-verification instrument), 16 §5 (fiscal retention), 18 §§4–5, 11 (Redis law, PII log masking, credential encryption).
- **Events added to the 01 §4 catalog by this spec:** `governance.export_generated / erasure_requested / erasure_executed / legal_hold_set / legal_hold_released / restore_drill_recorded`.
- **Runs as:** BullMQ jobs in `services/jobs` (export generation, lifecycle enforcement, backup monitors) + runbooks in `docs/runbooks/` (versioned in-repo, PR-reviewed like code).

## 3. Functional requirements

**Recovery objectives & backups**
- 22-F1 Cloud Postgres: **RPO ≤ 5 min** via continuous WAL archiving with point-in-time recovery; **RTO ≤ 4 h** for a full cloud restore (database restored, services redeployed, sync gateway accepting devices). Measured in every drill (22-F8), not assumed.
- 22-F2 Automated base backups + continuous WAL, PITR window **≥ 30 days**. Backups MUST be vendor-portable: standard Postgres base-backup + WAL formats restorable to self-managed Postgres — no backup path that only the managed vendor can read (see 22-F17).
- 22-F3 Object storage: versioning ON for all buckets; lifecycle rules per the retention matrix (22-F13); delete operations are soft (version-retained) for ≥ 30 days.
- 22-F4 Redis is explicitly **NOT backed up** — 18 §4 law: never a source of truth, everything reconstructible from Postgres. Warm-up runbook after Redis loss: restart workers against empty Redis; re-register BullMQ repeatables from code; re-enqueue pending work by scanning Postgres state (fiscal queue drains, undelivered webhooks, unsent notifications) — every producer module MUST document its re-enqueue scan in that runbook before shipping a queue-writing feature.
- 22-F5 Backup ownership: the platform engineering lead owns the backup/restore runbook — named in `docs/runbooks/OWNERS`, reassignment is a PR. An unowned runbook fails CI.
- 22-F6 Backup monitoring feeds the doc 15 fleet-health surface: WAL-archive lag, last-base-backup age, object-storage lifecycle job status. Threshold breaches (22-N1) page the runbook owner; silence (missing metric) is itself an alarm.
- 22-F7 **Post-restore tail heal:** after any restore to an earlier point T, per-device ack high-water marks revert with the database; on reconnect each device MUST re-push every own event above the server's advertised high-water mark from its rolling window — not merely its unacked outbox — and event-id idempotency (01-F8) makes re-push safe. Because the rolling window (business day + N days, 01-F14) far exceeds the RPO, branch-originated events in the loss tail recover automatically. Cloud-originated events not yet delivered to a branch (storefront/WhatsApp orders inside the loss window) have no second copy and are the true exposure — this is why 22-F1's RPO is minutes, not hours. The sync gateway MUST support this revert-and-reconverge without manual per-device intervention.

**Restore drills**
- 22-F8 **Quarterly restore drill:** restore a production backup (including one PITR to an arbitrary mid-day point) into staging, bring up the full service set, then run the doc 20 §4.2 Auditor full-ledger refold against the restored data. **A restore is not proven until the refold is clean** — read models rebuilt from restored events match, hash chains unbroken, invariants hold. Elapsed time recorded against 22-F1's RTO.
- 22-F9 Drill results (pass/fail, timings, findings) are recorded as `governance.restore_drill_recorded` and visible in doc 15. A missed or failed drill blocks the next release train (20 §4.6) until remediated.

**Encryption & keys**
- 22-F10 At-rest encryption on all stores (provider-level disk encryption: Postgres, object storage, Redis) plus app-level AES-GCM for integration credentials with KMS-held keys (18 §11). Backups and WAL archives are encrypted. Key custody: KMS keys owned by the platform, access limited to the services that need them, human access audited. Rotation: credential-wrapping data keys rotated annually or on suspicion of compromise (re-wrap, not re-encrypt-the-world via envelope encryption); device/session token signing keys per 01-F25 rotation. Key deletion is the crypto-shredding primitive used by 22-F14.

**Regional placement & failover**
- 22-F11 Primary region: nearest reliable to Pakistan — Singapore or a Middle East region (00 §3 latency posture); exact region chosen at infrastructure setup and recorded in the runbook. **Regional failure means:** branches keep billing and printing (00 §5.1); storefront, WhatsApp, owner/manager remote views, and back office degrade honestly; cloud-originated orders queue per 00 §5.1. **Recovery posture: restore-in-alternate-region runbook** — pre-selected alternate region, backups replicated cross-region, DNS/endpoint switch documented — NOT active-active multi-region, which is unjustified at this scale. Alternate-region restore is exercised in at least one drill per year under 22-F8.

**Data residency & vendor data flow**
- 22-F12 The vendor data-flow map below is normative; adding a vendor or widening a data flow requires a PR to this table. Pakistan data-residency and cross-border transfer rules for each flow: **verify at build/enablement time** — this spec asserts no legal conclusion (Pakistan's data-protection legislation status must be checked against current law before first production org).

| Vendor / service | Org data that flows | Minimization rule |
|---|---|---|
| Managed Postgres (e.g. Neon) | Full ledger + read models incl. customer PII, fiscal records | Primary store; region per 22-F11 |
| Managed Redis | Transient job payloads (order ids, phone refs) | TTL-bounded; never source of truth (18 §4) |
| S3-compatible object storage | Invoice/wastage photos, export bundles | Lifecycle per 22-F13 |
| Meta (WhatsApp Business) | Customer phones, message content, order confirmations | Channel-inherent; governed by Meta terms |
| Anthropic (LLM API) | Aggregated metrics + brief/analyst text via doc 13 semantic layer | No raw customer file; injection-filtered (20 §2.13) |
| Sentry / OpenTelemetry backend | Stack traces, device ids, request metadata | PII scrubbing on; phones masked at source (18 §5) |
| Expo EAS / GitHub | Build artifacts, source | No org data |
| FCM / APNs | Device push tokens, notification text | Notification bodies minimized (ids over names) |

**Retention, erasure & legal hold**
- 22-F13 Retention matrix (normative; lifecycle jobs enforce it):

| Data class | Retention | Erasure interaction |
|---|---|---|
| Kernel events (01 §5) | Forever (archive-tier economics open — 01 §9.4) | PII fields redactable per 22-F14; envelope + non-PII payload immutable |
| Fiscal records (16 §5) | ≥ statutory audit period (≥ 6 y — verify at build) | Exempt from erasure while within statutory retention |
| Customer file read model | Life of org | Erasure redacts PII, identity key tombstoned |
| Media: photos referenced by fiscal/purchase records | Follow fiscal retention | Exempt as above |
| Media: other invoice/wastage photos | 24 months, then lifecycle-deleted | Deleted on erasure if customer-linked |
| Logs & telemetry | 90 days | Phones masked at source (18 §5) — nothing to erase |
| Backups / WAL | 30-day PITR window, then aged out | Crypto-shredded PII is unreadable in backups immediately (22-F14) |
| Export bundles | 7 days (signed URLs), then deleted | — |

- 22-F14 **PII erasure over an append-only ledger:** the ledger is never rewritten; erasure targets PII only. Designated PII payload fields (customer name, phone, address — enumerated per event type in `packages/domain`) are envelope-encrypted at write with a per-customer data key. An erasure request emits `governance.erasure_requested`; execution destroys the customer's data key (**crypto-shredding**) and redacts the customer-file read model, emitting `governance.erasure_executed` listing affected entity/field classes. Ciphertext stays in place, so event envelopes, non-PII payload, and audit hash chains (01-F5) remain intact and refoldable — and PII inside existing backups becomes unreadable the moment the key dies, without touching a single backup. Erasure never removes transactional facts (orders, amounts, timings) and is refused for data under fiscal retention (22-F13) or legal hold (22-F15), with the refusal recorded. Final mechanism design is confirmed at build time (§9.3) but MUST preserve: append-only ledger, intact hash chains, audited erasure, backup coverage.
- 22-F15 **Legal hold:** platform admin can freeze all deletion/redaction (erasure, media lifecycle, backup aging where technically controllable) for a named org on a documented request — `governance.legal_hold_set` with the request reference; release is `governance.legal_hold_released`. Active holds are visible in doc 15 and block 22-F14 execution and 22-F13 lifecycle jobs for that org.

**Org export & platform exit**
- 22-F16 **Owner-triggered full export** from back office (doc 14): the org's complete event log as JSONL (canonical envelopes), every read model as CSV, and a media manifest with signed URLs — generated async by a job, delivered as a bundle, recorded as `governance.export_generated` (audited; owner-role only). No proprietary formats anywhere in the bundle.
- 22-F17 **Vendor exit:** documented runbook to leave the managed-Postgres vendor by restoring standard backups (22-F2) to self-managed Postgres and repointing services; likewise S3-compatible storage is portable by protocol. Platform exit for an org = 22-F16 export. Both paths exist on paper and are drill-verified (alternate-target restore counts under 22-F8).

**Account-suspension & provider-failure contingencies**
- 22-F18 **WhatsApp WABA suspension:** the channel degrades, orders do not stop — storefront links go out via SMS fallback, order notifications drop to SMS or none (honestly labeled), in-branch and storefront ordering unaffected. Recovery runbook covers Meta appeal + a standby WABA where policy permits (verify at enablement).
- 22-F19 **LLM provider outage:** briefs and alerts fall back to templated non-LLM rendering (doc 13's existing fallback); conversational analyst is unavailable, honestly. No operational surface depends on the LLM.
- 22-F20 **Managed-Postgres vendor failure** (outage or business failure): branches unaffected (00 §5.1); recovery = 22-F17 restore path to alternate vendor or self-managed, within 22-F1 RTO once executed.

## 4. Key flows

**Flow A — Cloud data-loss incident (restore + tail heal):** incident declared → restore Postgres via PITR to latest clean point T (≤ 5 min behind per 22-F1) → redeploy services, Redis warm-up runbook (22-F4) → devices reconnect; gateway advertises reverted high-water marks; devices re-push the tail from rolling windows; idempotency dedupes (22-F7) → Auditor refold run before declaring recovery (20 §4.2) → incident report includes measured RPO/RTO and any cloud-originated-order loss, disclosed to affected orgs.

**Flow B — Quarterly drill (22-F8):** pick a mid-day PITR target → restore into staging → full service bring-up → Auditor full-ledger refold → record `governance.restore_drill_recorded` with timings → findings become runbook PRs.

**Flow C — Erasure request:** customer request reaches org owner → owner files it in back office → job validates against fiscal retention + legal hold → key destruction + read-model redaction → `governance.erasure_executed` → confirmation to org with what was and wasn't erasable and why.

## 5. Data

- **Entities owned:** `governance_requests` (erasure/export/legal-hold, state, request document reference), `restore_drills` (schedule, results), `vendor_data_flows` (the 22-F12 register, versioned), per-customer data-key registry (KMS-backed, 22-F14).
- **Events:** the `governance.*` family (§2). All are ordinary audited kernel events (01-F5).

## 6. Non-functional requirements

Cross-cutting NFRs inherited from 00 §5. Module-specific:

- 22-N1 Backup alarms: WAL-archive lag > 10 min → page; last base backup age > 26 h → alert; object-storage lifecycle job silent > 48 h → alert. All into doc 15.
- 22-N2 Drill cadence: ≥ 1 restore drill per quarter; ≥ 1 alternate-region (or alternate-vendor) restore per year. Overdue = release-train block (22-F9).
- 22-N3 Export generation (22-F16): a one-branch org with one year of history < 1 h; any org ≤ 24 h; owner sees progress state, never a spinner.
- 22-N4 Redis warm-up runbook (22-F4) completes < 30 min, measured in drills.
- 22-N5 Erasure execution (22-F14) completes < 72 h from validated request, including read-model redaction.

## 7. Customizability

- **Layer 1 (platform admin):** PITR window (≥ 30-day floor), drill schedule, legal hold, alarm thresholds within 22-N1 bounds, alternate region selection.
- **Layer 2 (org):** media retention period within platform bounds; who may trigger export (owner-role default).
- **Layer 3 (branch/device):** none.
- **Deliberately not configurable, ever:** disabling backups for an org; erasing data under fiscal retention or legal hold; shortening event retention; any org-level switch that weakens 22-F1/22-F2.

## 8. Tech notes

- Managed-Postgres PITR/branching (e.g. Neon branches) is the natural drill mechanism — restore a branch at T, point staging at it. Verify the vendor also exposes standard base-backup + WAL export for 22-F2 portability; if not, run supplementary `pg_basebackup`/WAL shipping to own object storage.
- Staging uses MinIO (20 §1) — lifecycle and versioning rules are tested there before production.
- PII-field envelope encryption (22-F14) lives in `packages/domain` alongside payload schemas: the schema declares which fields are PII; the encryption wrapper is applied at event creation, transparently decrypted for authorized folds while the key lives.
- Runbooks are markdown in `docs/runbooks/`, owned via `OWNERS`, exercised via drills — an unexercised runbook is fiction.

## 9. Open questions

1. Archive-tier economics for permanent event retention (S3 parquet vs keep-hot) — shared with 01 §9.4; decide on year-2 cost data.
2. Pakistan data-residency / cross-border transfer law status for each 22-F12 flow — legal verification before first production org, revisited per vendor addition.
3. Erasure mechanism final design (22-F14): per-customer key granularity and KMS cost at fleet scale vs field-level redaction with hash-chain carve-outs — build-time spike; the invariants in 22-F14 are fixed either way.
4. SMS fallback provider (22-F18) selection and per-message economics — decide at Wave 2 with doc 07.
