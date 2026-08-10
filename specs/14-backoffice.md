# 14 — Restaurant Back Office (Web)

**Module spec — Draft 1, July 2026** · Parent: `00-platform-overview.md` (conventions §5–§7 inherited; this module **is** the layer-2 configuration surface of 00 §7). References: `01-kernel-sync.md` (catalog model 01-F21, devices 01-F25, conflict rules), `02/03` (routing targets), `10-inventory-supply.md` (recipes, tracked items), `12-owner-app.md` (report parity), `13-intelligence.md` (autonomy config surface 13-F28), `15-platform-admin.md` (layer-1 boundary), `16-tax-module.md` (tax posture), `restaurant-os.md` Appendix A (permission matrix seed). **Wave 1+, grows with modules.**

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
- 14-F1 Org-scoped: a session sees exactly one org. Role-gated per the permission matrix (Appendix A seed via 01-F26) — e.g. recipe editing only for owner/vendor-onboarding roles; menu/price edit per matrix; managers see only what their role grants.
- 14-F2 **Every settings change emits `config.changed`** with actor, entity, before/after values, and a config version bump. No silent edits exist (00 §5.5).
- 14-F3 The change history of any entity is browsable in place ("price changed by Ali, 2 Jul, 450 → 480") — the audit trail is a first-class UI element, not a hidden log.
- 14-F4 Changed reference data propagates to devices via kernel sync (01-F21); each config screen shows distribution state ("live on 4 of 5 devices") from sync status (01-F11), honestly aged per 00 §5.7.

**Catalog management**
- 14-F5 Full editing, within append-only law, of the 01-F21 catalog chain — Category → MenuItem → Variant → ModifierGroup/Modifier — covering:
  - display name (English — 00 §5.6);
  - images (S3), sort order, category tabs;
  - per-channel visibility flags (an item can be dine-in-only or storefront-hidden).
- 14-F6 Pricing: per variant/channel price edits emit `catalog.changed`; price history is viewable per item. Order lines snapshot price at line-add and are never re-derived (01-F18) — the price editor states this ("open orders keep their price"). The editor's shape and its completeness rule are `14-F29`.
- 14-F29 **The item editor collects a price for EVERY enabled (branch, channel) pair, prefilled from one number (founder ruling July 2026).** `14-F6` required per-channel pricing without saying what the editor asks for. Ruled: adding or editing a sellable item shows a price **grid** — a row per branch, a column per enabled channel (`00 §7` layer 2) — **prefilled with a single value and settable across the whole grid in one action**, with overrides typed on top of individual cells. Saving an item that leaves an enabled pair unpriced is **refused** — the same rule the kernel enforces at publish (`01-F60`), stated here because this editor is where an owner meets it.
  - **The grid is the reason prefill is mandatory rather than a nicety.** A single-branch org sees one row and types one number. A five-branch org faces 5 × 5 = 25 cells per item, of which most are usually equal — so an editor without a fill-across action would make the honest schema unusable and drive owners toward whatever shortcut existed. Fill-across, then override the few that differ, is the interaction the ruling names, and `14-F8`'s bulk % adjustment applies per column so a foodpanda uplift can be applied across the menu in one act.
  - **Why prefill rather than a house-price fallback.** The cheap alternative — one base price with optional per-channel overrides — makes a *forgotten* override indistinguishable from a *deliberate* equal price. On an aggregator that means selling at the in-restaurant rate while commission (25–35%) still takes its cut: invisible at the till, frozen by `01-F53`, and surfacing months later as thin margin nobody can attribute. Prefilling buys identical one-number onboarding and leaves no silent case. The completeness rule is enforced in the kernel because a bulk import (`15-F8`) never opens this editor.
  - Channel prices participate in `14-F3` history and `14-F8` bulk edit per channel, and sit beside `14-F5`'s per-channel visibility flags: **visibility says where an item sells, price says for how much**, and neither stands in for the other.
- 14-F7 Archive, never delete: items with sales history are archivable (hidden from menus and POS grids) but remain resolvable for historical reports and event folds.
- 14-F8 Bulk edit: multi-select price adjustment (absolute or %) with preview and a single confirmation, emitted as individual `catalog.changed` events so history stays per-item.

**Recipes (with doc 10)**
- 14-F9 Two recipe editors, editable by the vendor onboarding team and permitted org users only (Appendix A):
  - **menu recipe:** sold item/variant → ingredient lines (raw or prepared, integer mg/ml/units per 00 §6);
  - **prep recipe:** inputs → prepared output with yield % ("18 kg raw → 15 kg marinated boti").
- 14-F10 Tracked-item discipline surfaced: the editor shows which ingredients are `is_tracked`, the recipe-coverage % of trailing revenue (feeds the 13-F5 margin precondition), and par levels per location.

**Printing & station routing**
- 14-F11 Routing rules: category/item → station(s) → printer(s), per branch; validated against registered printers (doc 03); a test-print button per rule proves the route end-to-end. Station classes are assigned here; physical printer assignment stays a device-layer setting (doc 03).

**Device management**
- 14-F12 Device list per branch: class, app version, last-seen, sync lag. Pairing via one-time codes (01-F25); station class assignment per device.
- 14-F13 Revocation is immediate ("stolen tablet" flow): `device.revoked` → cloud token rejected, LAN participation flagged branch-wide on next contact (01-F25); the list shows revoked state and actor.
- 14-F30 **`device.manage` is the permission action for this §3 block, and it is OWNER-ONLY (August 2026 — a PINNED INTERPRETATION, contestable, not a transcription).** `14-F1` gates this module "per the permission matrix (Appendix A seed via 01-F26)" and commandment 8 requires every request to pass `can()`, but **Appendix A has no device row at all** — so until this FR the device surface had nothing to authorize against, and `14-F12`/`14-F13` could not be built without either inventing policy (commandment 2) or shipping an ungated destructive act. The five decisions:
  - **THE ACTION IS DECLARED HERE, AND APPENDIX A IS NOT EXTENDED — on the corpus's own precedent, counted rather than asserted.** Before this FR the matrix carried **22** actions and Appendix A was a **15-row** table mapping one-to-one onto 15 of them, so **7 of the 22 were already decided by the FR that names them** and not by the appendix: `order.price_override` and `approval.grant` (02-F20, with 02-F38 for the self-approval refusal), plus the five service-surface rows `shift.open_close` · `cash.count` · `cash.drawer_no_sale` · `cash.paid_out` · `refund.issue` (02-F21..02-F26, 02-F36, 02-F43, 05-F19). ⚠ **The count turns on one reading, stated so it is checkable rather than asserted:** Appendix A's *Day open / close, cash count* row decides `day.open_close` **only** and not `cash.count`, because 05 §3 splits the two acts — doc 02 owns the cashier's own drawer count at shift close (02-F23), doc 05 the manager's day-close count entry — which is the reading `packages/domain` already ships. Read the other way, so that one row decides both, it is 6 of 22. Either way the precedent holds and this FR follows it: 01-F26 names Appendix A a **seed** and §7 lists the matrix's hard rules among the things that are deliberately not configurable, so the appendix is a fixed origin, not a register that grows. Extending it per FR would also make it disagree with `restaurant-os.md`, which no code reads.
  - **ONE action, not two.** The simpler split — a read action for `14-F12`'s list and a destructive one for `14-F13`'s revocation — was considered and rejected as *speculative* while every cell is identical: two actions with the same four cells differ in nothing an implementation can observe. It becomes a real question the moment a role is widened into the list, and that is the edit to make then. Precedent: `catalog.edit_menu_prices` already gates the catalog READS for exactly this reason (no Appendix A read row exists, and inventing one is inventing policy). The name comes from this block's own heading, **Device management**, so a later act added here (01-F25 pairing, station-class assignment) inherits it deliberately rather than by omission.
  - **Owner allow · Branch Mgr deny · Cashier deny · Storekeeper deny.** The corpus names exactly one role for this act and names it twice — `14-N2` ("an owner can change a price **or revoke a device** from their phone") and §4's *Device revocation* flow ("**Owner** marks a tablet stolen"). No FR puts a manager, cashier or storekeeper on it. §9's first open question — "whether managers get a scoped back-office slice on phones … or stay manager-console-only until pilots demand it" — is the corpus stating that a manager's back-office reach is **undecided**, so widening one here would be answering an open question by accident. Widening is additive and safe; narrowing later is not, and the wrong guess in the permissive direction is an accidental or malicious revocation, which stops a till mid-service.
  - **The pairing with `catalog.edit_menu_prices` is the structural argument, not an analogy.** `14-N2` puts the two acts in one sentence as the two things an owner does from a phone, and Appendix A's *Edit menu & prices* row is `—` · optional · `—` · ✔ — the only back-office config row it carries, resolved to owner-only in `packages/domain` because "optional" is org-configurable and no FR states its default. A device row drawn by the same hand would look the same.
  - **The ACTOR is the authenticated back-office session, and it is recorded on `device.revoked`** (org-scoped per 01-F62; T-01-09 puts `device.registered / revoked` emission on this doc's emitter and not on the kernel's registry seam). `14-F13`'s "the list shows revoked state and actor" is therefore two reads joined: **revoked state** from the device registry, **actor** from the org-scoped event. `01-F48`'s eviction is unaffected — it reads `revoked_at`, so the ledger row is attribution and never enforcement, and a failed append leaves a dead till with an unattributed revocation rather than a live till with an attributed one.
  - ⚠ **`device.registered` stays unemitted, and this FR does not close that half.** Registration today is an operator command on the service host with no authenticated user, so the only actor it could write is `null` — permanently, into an append-only store (commandment 1), and "somebody registered this and we do not know who" is a worse record than none because it looks like one. It is unblocked by 01-F25's back-office pairing code, not by this FR. The consequence is stated rather than implied: the org-scoped history holds revocations with no matching registrations, so **it is not a device history and no surface may render it as one** — `14-F12`'s list is the authority for which devices exist, and the event supplies only *who revoked*.
  - **No un-revocation.** The corpus is SILENT rather than permissive — no FR, no `DECISIONS.md` row — and 01-N5's replacement path (a fresh `device_id`) is what exists. A restore control here would be inventing security policy.

**Users, roles, PINs**
- 14-F14 User CRUD with role × per-location assignment; per-user permission overrides within matrix bounds; PIN set/reset (never displayed; Argon2id per 00 §5.4); deactivation preserves historical attribution.
- 14-F15 Owner-visible login and audit history per user, rendered from `audit.*` events.

**Presets, tier, signal ownership**
- 14-F16 Operating profile + hardware tier (T1/T2/T3) selection; changing tier re-applies that tier's defaults with an explicit diff preview before confirmation — nothing silently resets.
- 14-F17 **Signal ownership** assignment: which role advances which order state (e.g. who marks "ready" — pass screen at T2, kitchen staff at T3 per doc 03), presented as role picks per signal from the designed list — never free-form workflow design (design law 3).

**Approvals, thresholds, channels, alerts, tax**
- 14-F18 Approval thresholds, adjustable within platform-designed bounds only:
  - discount % ceiling before manager PIN is required;
  - void-after-KOT rules (always PIN + reason per Appendix A);
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

- 14-F28 **A menu edit's application time is the owner's choice per edit — default DAY-END, with an explicit immediate option (gap G17, founder ruling July 2026).** `27-F4` makes adding, removing or reordering an operational grid item a **breaking change**, because a cashier's speed is muscle memory; but back-office menu editing is a runtime org action, and nothing connected the two. The resolution honours both: **the default is the 05:00 business-day boundary (`01-F46`), so a grid never moves under a cashier mid-shift** — and because menu changes are sometimes genuinely urgent, the owner may mark any edit **apply now**, which is a deliberate act with the consequence stated on the control, not a hidden default. Pending day-end edits are visible and cancellable until they land. New items carry a first-days marker on the grid so a cashier can find what changed. **Amends `27-F4`**: the acclimation requirement binds the *vendor's* shipped grid structure absolutely, and org menu content through this timing rule.

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
- **Layer 3 (device):** not set here, except the device detail page delegates device-layer settings (float, idle-lock) for convenience — recorded as that device's own config events.
- **Deliberately not configurable:** anything declared platform law in 01 §7; the permission matrix's hard rules (no role edits history — `restaurant-os.md` Appendix A); signal-ownership options beyond the designed role list; free-form roles, workflow states, or report builders; thresholds outside designed bounds.

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
6. ~~Whether an owner assigned to a single branch should be able to revoke a device at that branch~~ **RULED (founder, August 2026): YES — a branch-scoped owner may revoke a device at their own branch.** `14-F30`'s cell was already `owner: allow`; what blocked it was mechanical rather than policy — neither device procedure states a `branch_id`, and the registry read happens *inside* the revocation, so a caller-stated branch would have been checked **after** the destructive act. The effective permission was therefore org-wide owner only, and an owner running one branch could not kill a stolen till without calling someone. **Widening is additive and safe; narrowing later would not be** — and the failure it removes is a live security one, since `01-F48` gives revocation a 30 s eviction budget that is worthless if nobody present is allowed to press it. **Code owed, and the ordering is the whole of it:** the device's `branch_id` must be read and checked against the caller's assignment **before** `revoked_at` is set, never after — a check that runs after the act authorizes nothing, and `01-F1` makes the act unremovable. `revokeDevice`'s existing behaviour for an org-wide owner is unchanged.
