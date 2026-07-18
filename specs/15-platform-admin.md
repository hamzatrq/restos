# 15 — Vendor Platform Admin (Internal Web)

**Module spec — Draft 1, July 2026** · Parent: `00-platform-overview.md` (conventions §5–§7 inherited; this module **is** configuration layer 1 of 00 §7). References: `01-kernel-sync.md` (device registry, heartbeats 01-N2, provisioning), `06-storefront.md` (take-rate metering consumer), `07-whatsapp-channel.md` (support rail), `10-inventory-supply.md` (tracked-item discipline for recipe onboarding), `13-intelligence.md` (LLM cost metering 13-F30, rung caps), `14-backoffice.md` (layer-2 boundary, wizard handoff). **Wave 1+, grows with the fleet.**

## 1. Purpose & scope

The platform admin is the RestOS operations team's internal web tool: org lifecycle and plan control, onboarding tooling, fleet health, support tooling, release management, and usage metering. It is never visible to restaurants. It is the **only** place layer-1 settings exist: provisioning, feature/tier gates, the own-channel take-rate %, and rollout channels (00 §7).

Users: internal staff only — roles: support, onboarding, fleet-ops, platform-admin. Every action here is audited; actions that touch an org's data land in **that org's ledger** as layer-1-actor events, so a restaurant's history is complete even where the vendor acted.

## 2. Position in platform

- **Depends on:** api-gateway (internal-scoped tRPC, separate auth domain); the device heartbeat pipeline (00 §3 observability); doc 13 LLM gateway metering; doc 06 own-channel order metering; doc 07 for support conversations; EAS/build infrastructure for release channels.
- **Emits into org ledgers:** `config.changed` (layer-1 actor: plan, flags, take-rate, suspension), `device.revoked` (support-initiated), `catalog.changed` (bulk import, onboarding actor), `audit.impersonation_started` / `audit.impersonation_ended` (extension to 01 §4).
- **Platform-internal state** (rollout channels, runbook progress, support cases, staff accounts) lives in platform tables outside org ledgers, with its own append-only audit.
- **Consumes:** device heartbeats; sync telemetry (01-F11 aggregates); `kot.print_failed` rates; `audit.*`; per-org usage counters — orders from the ledger, messages from doc 07, LLM cost from 13-F30, own-channel order value from doc 06.

## 3. Functional requirements

**Access control (internal)**
- 15-F1 Internal staff SSO with mandatory 2FA; role-scoped: support / onboarding / fleet-ops / platform-admin.
- 15-F2 Destructive actions (suspension, take-rate change, forced update, kill switch) require the platform-admin role and a typed confirmation naming the org.
- 15-F3 Every staff action is audited (actor, org, before/after); the audit view is read-only for every role including platform-admin.

**Org lifecycle**
- 15-F4 Org provisioning: create org → operating profile + tier preset → branches → hand off to the doc 14 onboarding wizard. Provisioning emits the org's first `config.changed` events.
- 15-F5 Plan & feature-flag enablement per org, each flag change an org-ledger `config.changed` with actor:
  - tier gates (which T1/T2/T3 surfaces the org can configure);
  - module flags: tax add-on (doc 16), marketing/loyalty (doc 17);
  - channel enablement: storefront, WhatsApp, foodpanda (docs 06/07/08);
  - intelligence max-rung cap (13-F28).
- 15-F6 **The own-channel take-rate % per org lives here and only here** (bounded 0–5% by platform constants): the metering configuration consumed by doc 06 for storefront/WhatsApp/QR order-value metering. Changes take effect from a stated date, never retroactively, and are read-only visible in doc 14 (14-F20).
- 15-F7 Suspension: reversible; gates cloud services (storefront down with an honest notice, sync still accepted, new cloud-originated orders blocked) — **in-branch POS billing never stops** (00 §5.1 is not a business lever). Suspended orgs' devices show a status banner; reactivation restores service within minutes.

**Onboarding tooling**
- 15-F8 Menu bulk import, as a staged pipeline:
  1. upload spreadsheets or foodpanda menu exports;
  2. column/field mapping UI (saved as reusable mapping templates);
  3. validation — duplicate names, price sanity, orphaned modifiers;
  4. staged preview of the resulting catalog;
  5. commit as `catalog.changed` events into the org, attributed to the onboarding actor.
  Re-import diffs against the existing catalog instead of duplicating.
- 15-F9 Recipe-mapping workbench, used live in session with the chef:
  - pick the top 10–20 high-cost tracked ingredients (doc 10 discipline — not the full menu);
  - map menu items → recipe lines with unit-conversion helpers;
  - capture prep recipes + yield %;
  - show live recipe-coverage % of trailing revenue as the session progresses (target visible: the 13-F5 margin precondition).
  Output is ordinary doc 14 recipe data attributed to the onboarding actor.
- 15-F10 Printer/device setup runbooks: per-branch checklist instances (printer model, transport, test-print result, cash-drawer trigger, pairing done) generated from the org's tier; progress persists and gates the corresponding doc 14 go-live checklist item.

**Fleet health**
- 15-F11 Device heartbeat dashboard, fleet-wide with org/branch drill-in, filterable by any dimension, showing per device:
  - app version and rollout channel;
  - printer status (per attached printer);
  - sync lag + outbox depth (01-F11);
  - storage headroom and battery;
  - clock skew (flagged > 5 min per 01-N2);
  - last-seen timestamp.
- 15-F12 Every dashboard value shows its heartbeat age — 00 §5.7 sync honesty applies to the vendor's own tools too.
- 15-F13 Per-branch sync topology view: current hub, connected peers, LAN vs WAN paths, last election, per-device replication positions — the doc 01 mesh made visible for support diagnosis.
- 15-F14 Alerting to support staff, routed to the on-call channel (WhatsApp/Slack) with org/branch/device context attached, on:
  - device silent beyond threshold during that branch's business hours;
  - sync lag or outbox depth beyond threshold;
  - `kot.print_failed` rate spike;
  - storage or battery critical;
  - clock skew flag (01-N2).

**Support tooling**
- 15-F15 **Org impersonation with consent + full audit:** support requests a scoped session (org, surface, read-only vs write, duration ≤ 4 h); the owner approves via owner app or WhatsApp; approval emits `audit.impersonation_started` in the org's ledger; every action during the session carries both identities; expiry emits `audit.impersonation_ended`.
- 15-F16 Write-mode impersonation additionally requires the platform-admin role and the owner's explicit approval of write scope. No consent path = no access; there is no break-glass that skips the org-ledger audit.
- 15-F17 WhatsApp-centric support hooks: inbound support conversations (doc 07) link to the org record; from a support thread, staff can open the org's fleet view, request a diagnostics bundle, or start the consent flow — support context stays attached to the org timeline.
- 15-F18 Diagnostics bundle pull: on request (and owner-visible), a device uploads:
  - app logs and crash reports;
  - sync state + outbox depth snapshot;
  - printer queue state;
  - device info (OS, storage, battery, clock).
  Never customer PII or full order contents (15-N4). Bundles land in S3 with retention limits and link to the support case.

**Release management**
- 15-F19 Staged rollout channels: **internal → dev-pilot restaurants → fleet**; every build promotes through channels in order, never skipping; per-channel dashboards show version adoption %.
- 15-F20 Version pinning per org / branch / device-class (e.g. hold a fragile pilot on a known-good build); pins are visible, dated, and owned by a named staff member.
- 15-F21 **Forced-update windows never interrupt business hours** (00 §3): forced updates schedule only inside the branch's configured closed hours (default 03:00–06:00 local); a device that misses its window retries the next window — it is never force-updated while the branch is open. POS surfaces additionally require an idle state (no open orders) to apply.
- 15-F22 Kill-switch/feature flags: platform-wide or per-org disable of a feature slice (e.g. pause foodpanda ingestion on an API breakage) effective ≤ 5 min for online devices; kill-switch events are audited and surfaced honestly to affected orgs ("feature paused by RestOS — reason").

**Usage metering**
- 15-F23 Per-org monthly meters, with views + CSV export:
  - order counts by channel (from the ledger);
  - own-channel order value under the take-rate (from doc 06);
  - WhatsApp message/template counts (doc 07);
  - LLM cost (13-F30);
  - storage footprint.
- 15-F24 Meter threshold alerts to staff (e.g. the 13-F30 LLM soft cap). Metering is measurement only — invoicing and collections are outside this module.

## 4. Key flows

**New org**
1. Onboarding staff provisions the org (15-F4) with profile + tier.
2. Menu bulk import (15-F8), then the recipe workbench session with the chef (15-F9).
3. Printer/device runbook per branch (15-F10) in parallel with the doc 14 wizard run with the owner.
4. Go-live checklist passes → org enters the `dev-pilot` or `fleet` rollout channel.

**Support incident**
1. Owner WhatsApps "printer not working" → support opens the org from the thread (15-F17).
2. Fleet view shows the grill printer offline 40 min + a `kot.print_failed` spike (15-F11).
3. Diagnostics bundle pulled (15-F18); issue resolved via runbook steps.
4. If a device setting must change: consent-scoped impersonation (15-F15/16). Every step lands on the org timeline.

**Staged release**
1. Build passes CI → internal channel (office hardware rig).
2. Promote to dev-pilots → soak with per-version health telemetry (crash rate, sync errors).
3. Promote to fleet; forced updates honor 15-F21 windows.
- *Regression detected:* kill-switch the feature flag (15-F22), pin affected orgs (15-F20), roll the channel back.

**Suspension**
1. Platform-admin role suspends the org (typed confirmation, 15-F2).
2. Cloud gating applies per 15-F7; org banner + owner notification.
3. Reactivation restores within minutes; the entire episode exists as `config.changed` events in the org's own ledger.

## 5. Data

- **Owned (platform Postgres, outside org ledgers):** staff accounts/roles; rollout channels + version pins; runbook + checklist instances; support cases + links; diagnostics bundle index; usage meter aggregates; the platform audit log (append-only).
- **Org-ledger events emitted:** `config.changed` (plan/flags/take-rate/suspension), `device.revoked`, `audit.impersonation_started/ended`, `catalog.changed` (bulk import).
- **Consumed:** device heartbeats, sync telemetry, `kot.print_failed`, usage counters from docs 06/07/13.

## 6. Non-functional requirements (module-specific)

- 15-N1 Fleet dashboard interactive at 200 branches × ~5 devices; heartbeat freshness ≤ 60 s for online devices; filter/drill p95 < 2 s.
- 15-N2 Flag/kill-switch propagation ≤ 5 min to online devices; suspension/reactivation effective cloud-side ≤ 5 min.
- 15-N3 Impersonation sessions hard-expire server-side; revoking a staff account terminates its sessions ≤ 1 min.
- 15-N4 Diagnostics bundles ≤ 50 MB and redaction-tested: an automated scan (CI + on-ingest) verifies no customer phone numbers appear.

## 7. Customizability

This module is layer 1; §3 enumerates its levers (provisioning, flags/tiers, take-rate %, rollout channels, pins, rung caps). Internal knobs: alert routing targets, heartbeat thresholds, runbook templates.

- **Deliberately not configurable:** no staff path edits or deletes org ledger history (00 §5.5 binds the vendor too); no impersonation without owner consent; no forced update inside business hours — no override flag exists; no take-rate outside platform bounds; no per-org kernel behavior differences (01 §1 — the same kernel everywhere).

## 8. Tech notes

- Next.js internal app (00 §3) behind SSO + IP allowlist; internal tRPC router split from tenant routers at the gateway — internal tokens are never valid on tenant APIs and vice versa (separate auth domains).
- Heartbeat pipeline: devices report via a sync-gateway side-channel; aggregation to Postgres + OpenTelemetry metrics; alert fan-out via the jobs service to WhatsApp/Slack webhooks.
- Import/mapping components shared with doc 14 (`packages/ui`, web side); the foodpanda menu-export parser lives in `services/foodpanda` and is reused here.
- Release channels bind to EAS channels (RN fleet) and the Electron auto-update feed; version pins are implemented as channel overrides on the device record.
- Playwright coverage for provisioning, flag changes, impersonation consent, and the kill-switch path.

## 9. Open questions

1. Consent flow when the owner is unreachable and the branch is down mid-service — is manager-level consent acceptable for read-only impersonation, or hard-block?
2. Whether dev-pilot orgs get a visible "pilot build" badge on staff-facing surfaces.
3. Diagnostics bundle retention period, and whether owners can self-download their bundles from doc 14.
4. The export contract for meter-derived invoicing (handoff format to whatever billing process exists) — out of scope here, but it needs an owner at build time.
5. Whether fleet-ops needs a synthetic-order canary (scripted test order per branch, off-hours, auto-voided) or heartbeats suffice.
