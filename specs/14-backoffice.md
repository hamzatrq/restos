# 14 — Restaurant Back Office (Web)

**Module spec — Draft 1, July 2026** · Parent: `00-platform-overview.md` (conventions §5–§7 inherited; this module **is** the layer-2 configuration surface of 00 §7). References: `01-kernel-sync.md` (catalog model 01-F21, devices 01-F25, conflict rules), `02/03` (routing targets), `10-inventory-supply.md` (recipes, tracked items), `12-owner-app.md` (report parity), `13-intelligence.md` (autonomy config surface 13-F28), `15-platform-admin.md` (layer-1 boundary), `16-tax-module.md` (tax posture), v1 spec §2.2 (permission matrix seed). **Wave 1+, grows with modules.**

## 1. Purpose & scope

The back office is the restaurant's administration surface: a responsive Next.js web app, org-scoped and role-gated, where everything in configuration layer 2 lives — catalog, recipes, printing/station routing, devices, users/roles/PINs, tier + signal ownership, approval thresholds, channels, alert thresholds, tax posture — plus desk-sized report views/exports and the onboarding wizard.

Used by owners, permitted managers, and the vendor onboarding team (acting as scoped org users). It is not an operational surface: no order entry, no floor state (docs 02/05), no availability toggling (01-F22 keeps that operational).

Everything here follows **presets, not knobs** (00 §7): a profile + tier choice sets defaults; individual settings adjust within designed bounds; this module introduces no free-form configuration.

## 2. Position in platform

- **Depends on:** api-gateway (tRPC); kernel reference-data distribution (01-F21, 01 §8 — catalog/config versions ride the event channel to devices); read models for reports; export jobs + S3.
- **Emits (extensions to 01 §4 marked):** `config.changed` (every settings change, with actor — module law); `catalog.changed` (extension: entity-level catalog edit with actor + before/after refs); `device.registered` / `device.revoked` (extension, per 01-F25); `user.changed` (extension: create / role change / PIN reset — PINs stored Argon2id, never present in payloads); `audit.*` for all admin actions.
- **Consumes:** report read models; device registry state + heartbeat summaries (doc 15 pipeline); doc 13 autonomy state and alert-config schema; doc 16 tax posture schema.

## 3. Functional requirements

**Shell, scope, audit**
- 14-F1 Org-scoped: a session sees exactly one org. Role-gated per the permission matrix (v1 §2.2 seed via 01-F26) — e.g. recipe editing only for owner/vendor-onboarding roles; menu/price edit per matrix; managers see only what their role grants.
- 14-F2 **Every settings change emits `config.changed`** with actor, entity, before/after values, and a config version bump. No silent edits exist (00 §5.5).
- 14-F3 The change history of any entity is browsable in place ("price changed by Ali, 2 Jul, 450 → 480") — the audit trail is a first-class UI element, not a hidden log.
- 14-F4 Changed reference data propagates to devices via kernel sync (01-F21); each config screen shows distribution state ("live on 4 of 5 devices") from sync status (01-F11), honestly aged per 00 §5.7.

**Catalog management**
- 14-F5 Full editing, within append-only law, of the 01-F21 catalog chain — Category → MenuItem → Variant → ModifierGroup/Modifier — covering:
  - display name (English — 00 §5.6);
  - images (S3), sort order, category tabs;
  - per-channel visibility flags (an item can be dine-in-only or storefront-hidden).
- 14-F6 Pricing: per variant/channel price edits emit `catalog.changed`; price history is viewable per item. Order lines snapshot price at line-add and are never re-derived (01-F18) — the price editor states this ("open orders keep their price").
- 14-F7 Archive, never delete: items with sales history are archivable (hidden from menus and POS grids) but remain resolvable for historical reports and event folds.
- 14-F8 Bulk edit: multi-select price adjustment (absolute or %) with preview and a single confirmation, emitted as individual `catalog.changed` events so history stays per-item.

**Recipes (with doc 10)**
- 14-F9 Two recipe editors, editable by the vendor onboarding team and permitted org users only (v1 §2.2):
  - **menu recipe:** sold item/variant → ingredient lines (raw or prepared, integer mg/ml/units per 00 §6);
  - **prep recipe:** inputs → prepared output with yield % ("18 kg raw → 15 kg marinated boti").
- 14-F10 Tracked-item discipline surfaced: the editor shows which ingredients are `is_tracked`, the recipe-coverage % of trailing revenue (feeds the 13-F5 margin precondition), and par levels per location.

**Printing & station routing**
- 14-F11 Routing rules: category/item → station(s) → printer(s), per branch; validated against registered printers (doc 03); a test-print button per rule proves the route end-to-end. Station classes are assigned here; physical printer assignment stays a device-layer setting (doc 03).

**Device management**
- 14-F12 Device list per branch: class, app version, last-seen, sync lag. Pairing via one-time codes (01-F25); station class assignment per device.
- 14-F13 Revocation is immediate ("stolen tablet" flow): `device.revoked` → cloud token rejected, LAN participation flagged branch-wide on next contact (01-F25); the list shows revoked state and actor.

**Users, roles, PINs**
- 14-F14 User CRUD with role × per-location assignment; per-user permission overrides within matrix bounds; PIN set/reset (never displayed; Argon2id per 00 §5.4); deactivation preserves historical attribution.
- 14-F15 Owner-visible login and audit history per user, rendered from `audit.*` events.

**Presets, tier, signal ownership**
- 14-F16 Operating profile + hardware tier (T1/T2/T3) selection; changing tier re-applies that tier's defaults with an explicit diff preview before confirmation — nothing silently resets.
- 14-F17 **Signal ownership** assignment: which role advances which order state (e.g. who marks "ready" — pass screen at T2, kitchen staff at T3 per doc 03), presented as role picks per signal from the designed list — never free-form workflow design (design law 3).

**Approvals, thresholds, channels, alerts, tax**
- 14-F18 Approval thresholds, adjustable within platform-designed bounds only:
  - discount % ceiling before manager PIN is required;
  - void-after-KOT rules (always PIN + reason per v1 §2.2);
  - comp rules and per-shift comp value ceiling.
- 14-F19 Channel configuration, gated by layer-1 channel flags (doc 15):
  - enable/disable storefront modes — QR dine-in / pickup / delivery (doc 06);
  - enable/disable WhatsApp ordering (doc 07) and foodpanda (doc 08);
  - commission % per channel (feeds channel-economics reporting, docs 12/13).
- 14-F20 The own-channel take-rate % is visible read-only here with its effective date; it is set only in platform admin (doc 15, 15-F5).
- 14-F21 Alert threshold configuration for the doc 13 detector classes (13-F10), with per-class sane defaults from the preset; quiet hours; critical-class exemptions.
- 14-F22 Autonomy surface per 13-F28: per branch × track — current rung, measured progress toward the next rung, R4 enablement toggles + spend caps, and the `autonomy.rung_changed` / `action.*` history.
- 14-F23 Tax posture (doc 16): off by default; per-channel and per-payment-method behavior; the compliance add-on is layer-1 gated (doc 15) but, once enabled, configured here.

**Reports & exports (desk mirror of doc 12)**
- 14-F24 The doc 12 report set rendered for desk use from the same semantic-layer metrics (12-F21 parity — one number everywhere), plus Excel/CSV/PDF export:
  - item profitability (theoretical food cost, margin per item);
  - branch comparison (identical columns, side by side);
  - channel economics (net of commission % and take-rate).
- 14-F25 Scheduled export delivery (e.g. weekly to the accountant) via email or WhatsApp document push (doc 07); schedules are org config and emit `config.changed`.

**Onboarding wizard**
- 14-F26 A resumable wizard: org details → branch(es) → menu import (manual entry or doc 15 bulk-import handoff) → users/PINs → devices (pairing codes) → printers (routing + test prints) → go-live checklist.
- 14-F27 The go-live checklist blocks "go live" until every item passes, each showing live status:
  - ≥ 1 device paired and syncing;
  - ≥ 1 printer passing a test print through its routing rule;
  - menu non-empty with required names;
  - opening-float amount configured;
  - owner app connected and receiving.
  Completion is recorded per step; a regressed item re-blocks the checklist.

## 4. Key flows

**Price change**
1. Manager opens item → edits price → preview shows affected channels + "open orders keep their price".
2. Confirm → `catalog.changed` + config version bump → reference delta distributed (01-F21).
3. Screen shows "live on N of M devices"; an offline device applies it on reconnect.
4. Any order line added before arrival keeps its snapshotted price (01-F18) — no retro-repricing, by design.

**Device revocation**
1. Owner marks a tablet stolen → confirm → `device.revoked`.
2. Cloud rejects its token immediately; hub flags it on LAN at next contact (01-F25).
3. Device list shows revoked state; the audit trail records actor and time.

**Signal-ownership change**
1. Owner moves "mark ready" from cashier to pass screen → preview shows affected surfaces and devices.
2. Confirm → `config.changed` → propagates to devices.
3. In-flight orders keep their current state machine; new orders use the new ownership — no ambiguous mid-order handoffs.

**Onboarding**
1. Vendor team + owner run the wizard over 1–2 sessions; recipe mapping happens in the doc 15 workbench in parallel.
2. Go-live checklist passes (14-F27) → tier defaults applied → first `day.opened` on POS.
- *Failure:* a checklist item regresses (printer dies before go-live) → the checklist re-blocks with the failing item named.

**Concurrent edits (failure path)**
- Two back-office users edit the same item → last-writer-wins by `server_received_at` with full audit (01-F18); the losing editor sees a non-blocking "newer change by X applied" notice with both versions in history. No other conflict class exists in this module (01-F20).

## 5. Data

- **Owned:**
  - catalog write model — the source of reference-data snapshots/deltas (01-F21);
  - org config document — the versioned layer-2 settings tree;
  - onboarding progress; scheduled-export definitions.
- **Events emitted:** `config.changed`, `catalog.changed`, `device.registered` / `device.revoked`, `user.changed`, `audit.*`.
- **Events consumed:** report read models (01-F7), `audit.*` for history views, device heartbeat state (doc 15 pipeline), doc 13 `autonomy.rung_changed` / `alert.raised` projections for the config surfaces.

## 6. Non-functional requirements (module-specific)

- 14-N1 Config/catalog propagation visible on online devices ≤ 60 s (fast-path classes such as availability are explicitly not this module's concern, 01-F22).
- 14-N2 Responsive down to a phone browser: an owner can change a price or revoke a device from their phone; full editors (recipes, routing) target tablet/desktop.
- 14-N3 Catalog scale: 500 items × 4 variants with modifiers remains editable without pagination pain; a bulk price edit of 100 items completes < 10 s end-to-end.
- 14-N4 Wizard resumability survives session loss and browser change; no step re-entry loses entered data.

## 7. Customizability

This module is the layer-2 surface — §3 enumerates exactly which settings exist. Its own placement in the layers:
- **Layer 1 (doc 15):** which modules/tiers/channels are even visible here (feature gates); take-rate % (read-only here, 14-F20).
- **Layer 2:** everything in §3 — that is this module's purpose.
- **Layer 3 (device):** not set here, except the device detail page delegates device-layer settings (language, float, idle-lock) for convenience — recorded as that device's own config events.
- **Deliberately not configurable:** anything declared platform law in 01 §7; the permission matrix's hard rules (no role edits history — v1 §2.2); signal-ownership options beyond the designed role list; free-form roles, workflow states, or report builders; thresholds outside designed bounds.

## 8. Tech notes

- Next.js (00 §3), tRPC to api-gateway, no direct DB access; Playwright covers every §3 group including the full wizard run.
- Config is a versioned settings tree validated by Zod schemas in `packages/domain` — the same schemas devices use to validate received reference data; a setting without a schema cannot ship (build-time enforcement).
- Image upload direct-to-S3 with server-issued signed URLs; devices receive cached image references, not sync payloads.
- The onboarding wizard shares import/mapping components with doc 15's tooling (`packages/ui`, web side).
- Report rendering and export generation share the doc 12 server-side renderer — one implementation, two surfaces.

## 9. Open questions

1. Whether managers get a scoped back-office slice on phones (thresholds, users) or stay manager-console-only until pilots demand it.
2. Which menu-import file formats owners actually possess — scope the self-serve importer from doc 15 onboarding experience.
3. Scheduled report delivery default: email vs WhatsApp document push (doc 07 template-cost tradeoff).
4. Whether tier downgrade (T3 → T2) needs a guided decommission flow for orphaned devices/stations, or archive-and-warn suffices.
5. Whether recipe editing should require a second confirmation when it changes theoretical cost by > 20% (fat-finger guard) — decide with doc 10 at build.
