# 13 — Intelligence Service

**Module spec — Draft 1, July 2026** · Parent: `00-platform-overview.md` (conventions §5–§7 inherited). References: `01-kernel-sync.md` (ledger, read models, event catalog), `07-whatsapp-channel.md` + `12-owner-app.md` (delivery surfaces), `10-inventory-supply.md` (forecasts, variance, par levels), `05-manager-console.md` (approval surface, channel pulse), `14-backoffice.md` (autonomy config surface), `15-platform-admin.md` (cost metering, rung caps). Concept doc §4.6 and **design law 6 (AI honesty) are binding on every requirement here.** **Wave 4, foundations from Wave 1.**

## 1. Purpose & scope

The intelligence service is the platform's brain, in five parts: a **semantic layer** of computable, citable metrics over the event ledger; the **nightly brief** generator; **anomaly detection**; the **conversational analyst** (WhatsApp + owner app); and the **autonomy ladder** that lets the system graduate — per restaurant — from describing to prescribing to acting. Cloud service only; no UI of its own (surfaces are docs 07/12/05/14).

**Design law 6, restated as module law:** the analyst answers only from the event ledger through the semantic layer. The LLM selects and parameterizes registered metrics and narrates their results; it never free-forms SQL, never asserts a number that did not come from the layer, and says "not enough data yet" when true. Autonomy is earned by measured accuracy per restaurant, never shipped on day one of a restaurant's history.

Users: owners (brief, alerts, analyst), managers (suggestions, approvals, announcements), the platform team (evals, cost, rung caps).

## 2. Position in platform

- **Depends on:** cloud read models + merged ledger (01-F7); doc 10 forecasts, par levels, variance results; doc 07 for WhatsApp delivery; doc 12 for push/in-app delivery; doc 05 for approvals and channel-pulse actions; BullMQ for scheduled jobs; Anthropic Claude API behind the internal LLM gateway (§3, gateway group).
- **Consumes:** the full org event stream (all types in 01 §4) via read models; `alert.acknowledged` from surfaces.
- **Emits (extends 01 §4 catalog):** `brief.generated` · `alert.raised` / `alert.acknowledged` (ack emitted by surfaces, owned here) · `suggestion.issued` · `action.proposed` / `action.approved` / `action.rejected` / `action.executed` / `action.reversed` · `autonomy.rung_changed`.
- Autonomous/approved actions additionally emit the ordinary domain event of the action itself (e.g. `availability.changed` for an 86, the doc 05/06 channel-pause event, a doc 10 PO event) with `actor_user_id` = the service principal and `refs[]` linking the `action.*` chain — the ledger never contains an unexplained system action.

## 3. Functional requirements

**Semantic layer / metric registry**
- 13-F1 A versioned registry of metrics. Each metric defines:
  - id (e.g. `sales.total`, `voids.count`, `cash.variance`, `stock.variance_value`, `margin.gross_estimate`) and human name (English);
  - definition text (what an owner is told it means);
  - computation: SQL over read models or a deterministic fold over events — nothing else;
  - dimensions (org/branch/channel/cashier/item/daypart/date range) and valid parameter ranges;
  - minimum-data preconditions (13-F5) and unit (paisas, count, %, mg/ml per 00 §6).
- 13-F2 Metrics are code, reviewed and versioned in the monorepo (`services/intelligence/metrics`); a metric change bumps its version; answers and briefs record the metric version used.
- 13-F3 **Golden-value tests:** every metric ships with fixture event logs and expected outputs; CI fails on drift. A metric without golden tests cannot be registered (build-time enforcement).
- 13-F4 Metric execution takes only typed, validated parameters (Zod). Dimension values are validated against org-scoped whitelists (branch ids, cashier ids, item ids). There is no code path from free text to query text.
- 13-F5 Each metric declares its minimum-data precondition (e.g. `margin.gross_estimate` requires recipe coverage on items representing ≥ 60% of period revenue; baseline metrics require their 13-F12 history). Execution below the precondition returns a typed `insufficient_data` result with the reason — never a number.

**Nightly brief generator**
- 13-F6 A nightly job per org (after `day.closed` per branch, or at the org deadline) computes a fixed metric set (the doc 12 summary content), then has the LLM narrate it in plain English (00 §5.6) with the structure: **what happened / what's odd / what to check tomorrow**.
- 13-F7 Every number in the brief text is interpolated from computed metric values — the LLM receives the values and writes connective narrative; a post-generation validator rejects any draft containing a numeric claim not present in the computed set (regenerate once, then fall back to the plain templated brief).
- 13-F8 The brief is emitted as `brief.generated` (org, branch(es), business date, metric values + versions, text) and delivered via WhatsApp (doc 07) and owner-app push (doc 12). Delivery failures retry; the brief is always readable in-app regardless.
- 13-F9 "What's odd" only includes items backed by an `alert.raised` or a metric outside its declared valid range; a quiet day says so plainly. "What to check tomorrow" only includes registered suggestion/alert follow-ups — never invented tasks.

**Anomaly detection**
- 13-F10 Rule-based threshold detectors run from day one, triggered on `shift.closed`, `day.closed`, `stock.count_recorded`, and `stock.purchase_recorded`:
  - voids > N per shift, or void value > X% of shift sales;
  - comp/discount value above thresholds;
  - cash over/short beyond threshold at shift close;
  - stock variance value beyond threshold after a count (doc 10);
  - supplier purchase price > Y% above the item's trailing median;
  - no-sale drawer opens > N per shift.
  Defaults come from the preset; org-configurable within bounds in doc 14.
- 13-F11 Per-entity baselines (cashier, branch, item): trailing distributions (e.g. discount % per cashier over their own last 30 shifts). A baseline detector fires when the current value exceeds the entity's p95 and the branch median by a configured factor.
- 13-F12 A baseline activates only with sufficient history: ≥ 20 completed shifts for a cashier baseline, ≥ 28 business days for branch/item baselines. Until then only threshold rules fire, and alert copy never claims a baseline comparison.
- 13-F13 Learned models (seasonality-aware baselines, theft-pattern sequences) may replace baseline math later behind the same detector interface; the `alert.raised` output schema does not change.
- 13-F14 `alert.raised` payload: alert class, severity, entities, time window, evidence (metric ids + values + thresholds/baselines that fired), dedupe key (the same condition is not re-raised within its window). Consumed by docs 12 and 07; `alert.acknowledged` is cross-surface.
- 13-F14a **Delivery path per wave (no alert fires without a surface):** W1 — all classes appear in the nightly summary's "what's odd" block (the summary push exists from W1, 12-F9). W2 — classes marked critical (critical cash variance, stock variance) additionally push immediately as WhatsApp utility templates (07). W4 — the full in-app alert inbox (12-F14..F18). The `alert.raised` schema is identical across waves; only delivery grows.

**Conversational analyst**
- 13-F15 Pull-mode Q&A on both surfaces (WhatsApp doc 07, in-app doc 12) — same brain, one conversation memory per owner (13-F19). Questions may arrive in English or roman-Urdu mix (input is uncontrolled); answers are always English (00 §5.6).
- 13-F16 Answer pipeline, in order, no step skippable:
  1. LLM plans — selects registry metrics + typed parameters as tool calls;
  2. the service validates parameters (13-F4) and executes the metrics;
  3. LLM narrates the executed results;
  4. a validator checks every numeric claim against executed results (as 13-F7).
  Answers carry citations: metric id, version, parameters, value.
- 13-F17 When preconditions fail or the question needs unregistered data, the answer is an honest refusal: "not enough data yet" with what's missing, or "I can't compute that" — optionally suggesting the nearest registered metric. The analyst never estimates from world knowledge.
- 13-F18 **Guardrails:** org id and user scope come from the authenticated session, never from model output — cross-org data access is structurally impossible at the gateway. Out-of-scope requests (general knowledge, other businesses, actions the ladder hasn't unlocked) are refused with a one-line explanation. User text is treated as data: it is never concatenated into SQL, shell, or metric definitions — prompt injection cannot alter metric execution by construction, and this is tested (13-F31).
- 13-F19 Conversation memory per owner: recent turns + pinned facts (branches, recurring concerns), shared across surfaces, org-scoped, erasable on request from doc 14.

**Autonomy ladder**
- 13-F20 Four rungs per **capability track**, unlocked independently **per branch** (org-level for org-scoped tracks): R1 describe (briefs + alerts) → R2 prescribe (suggestions) → R3 act-with-approval → R4 act-autonomously. Tracks at launch: **stock** (86/reorder/PO), **prep** (prep quantities), **staffing** (shift-level suggestions), **load** (channel pause on kitchen overload).
- 13-F21 R1 is on from day one (threshold detectors immediately; baselines per 13-F12).
- 13-F22 **R2 unlock criteria (measured, per track):**
  - *prep:* item demand forecast (doc 10) backtested MAPE ≤ 25% over trailing 28 days for the item class, with ≥ 8 weeks of sales history.
  - *stock (reorder):* item `is_tracked` with par levels set; count adherence ≥ 3 counts / 14 days sustained for 4 weeks; theoretical-vs-counted variance ≤ 10% at each of the last 3 counts.
  - *staffing:* ≥ 8 weeks of attendance (doc 11) + hourly sales history.
  - *load:* ≥ 4 weeks of order-aging data (doc 03 pipeline) for the branch.
- 13-F23 R2 output is `suggestion.issued`, displayed in the brief and on doc 05 surfaces; acceptance/edits are recorded to measure R3 eligibility. **Ownership boundary with doc 10:** doc 10's in-app prep/purchase suggestion lists (10-F22/F23) are always-on from Wave 3 and are NOT gated by this ladder — the prep/stock R2 rungs gate only the *push* of those suggestions into the brief/WhatsApp/console and everything above (R3/R4 acting). One computation (doc 10's), two exposure levels.
- 13-F24 **R3 unlock criteria:**
  - *draft POs:* ≥ 70% of the trailing 20 reorder suggestions accepted with ≤ 20% quantity edit.
  - *suggest-86 (one-tap approve):* theoretical stock level within 5% of counted at each of the last 5 counts for the item.
  - *load:* ≥ 75% of trailing 12 overload warnings followed by a manual pause/throttle within 10 min.
  R3 emits `action.proposed`; a permitted human approves/rejects on doc 05 (or WhatsApp per doc 07 for POs) → `action.approved` / `action.rejected` → on approval the domain event executes and `action.executed` is emitted.
- 13-F25 **R4 unlock criteria (double gate — measured eligibility AND explicit owner enablement in doc 14):**
  - *auto-86 on stockout:* trailing 20 suggest-86 proposals with ≥ 95% precision (approved, or not reversed within 15 min).
  - *auto-pause channel:* ≥ 80% precision on the trailing 10 load proposals.
  - *auto-reorder:* ≥ 90% of trailing 20 draft POs approved without edit, plus configured per-order and per-week spend caps.
- 13-F26 Every autonomous action is a kernel event chain (`action.proposed` → `action.executed` with `auto: true` + the domain event), is **announced** immediately (manager console banner + owner surfaces: "Auto-86: Karahi — stock at 0"), and is **reversible in one tap** — reversal emits `action.reversed` plus the compensating domain event. Nothing autonomous is silent, ever.
- 13-F27 **Demotion:** 2 reversals of a capability's autonomous actions within 7 days, or an unlock metric falling below its criterion, drops the capability one rung automatically. All rung changes (up, down, or manual override) emit `autonomy.rung_changed` with an evidence snapshot of the measured criteria at that moment.
- 13-F28 **Config/audit surface:** doc 14 shows, per branch × track: current rung, live progress against the next rung's criteria (the actual measured numbers), R4 enablement toggles + spend caps, and the full `autonomy.rung_changed` / `action.*` history. Doc 15 can cap the maximum rung per org (feature flag). Unlock criteria values are platform constants — never org-editable.

**LLM gateway**
- 13-F29 All LLM calls (brief, analyst, any future use platform-wide) pass through one internal gateway; no other module may call the Claude API directly (lint-enforced import boundary).
- 13-F30 The gateway logs every call: org, task type, prompt id + version, model, token counts, latency, cost. Per-org cost metering aggregates feed doc 15. Per-org monthly budget with soft-cap alerting to platform staff; at hard cap, graceful degradation — the brief falls back to templated text from the same metric values, the analyst queues with an honest "busy" reply. Numbers are never sacrificed; only narration degrades.
- 13-F31 Model tiering per task (brief narration vs analyst planning vs classification) is a gateway routing table — decided at build time against the then-current Claude model lineup and revisited each release; task code names a tier, never a model id.
- 13-F32 **Eval suites, run on every prompt or model change:** golden Q→A sets including roman-Urdu input variants (expected metric selections + parameters, expected refusals); an injection corpus (hostile user text attempting SQL/scope/instruction escape — must never alter metric execution or scope); brief structure lint (three sections present, every number traceable per 13-F7). A score drop blocks deploy.

## 4. Key flows

**Nightly brief**
1. `day.closed` arrives (or org deadline hits) → metric set computed, versions recorded.
2. Anomaly pass runs (13-F10/11) → any `alert.raised` feeds "what's odd".
3. LLM narrates; validator checks every number (13-F7).
4. `brief.generated` → doc 07 (WhatsApp) + doc 12 (push) delivery.
- *Failure:* LLM/gateway down or validator fails twice → templated brief from the same values, marked plain. Numbers are never delayed by narration.

**Analyst answer**
1. Question arrives (either surface) → session-scoped org/user context + memory loaded.
2. LLM plans metric tool calls → service validates params (13-F4) and executes.
3. LLM narrates → validator checks numeric claims → cited answer streams back.
- *Failure:* unregistered ask or unmet precondition → honest refusal (13-F17); validator rejection → one regeneration → fall back to raw cited values with minimal template text.

**Ladder climb (stock track)**
1. Counts accrue; R2 criteria met → `autonomy.rung_changed` (R2), visible in doc 14.
2. Reorder suggestions issue; acceptance measured against 13-F24.
3. R3 unlocks → draft POs proposed → approved on manager console → precision measured.
4. R4 eligibility shows in doc 14 → owner enables auto-reorder with spend caps → `autonomy.rung_changed` (R4).
5. Auto-PO emits `action.executed` + the doc 10 PO event, announced on manager + owner surfaces.
- *Bad week:* 2 reversals in 7 days → automatic demotion to R3, announced with the evidence snapshot (13-F27).

**Auto-86**
1. Theoretical stock hits 0 on a tracked item at R4 → `action.executed` + `availability.changed` (fast-path to every device and channel per 01-F22).
2. Announcement on pass/manager/owner surfaces.
3. Staff finds a hidden tray → one tap un-86 → `action.reversed` + compensating `availability.changed`; the reversal counts toward demotion stats.

## 5. Data

- **Owned (cloud Postgres; derived stores rebuildable per 01-F7):** metric registry (code) + `metric_run_log`; `baselines` (entity, metric, window stats); `alerts` read model (state, ack); `briefs` (values + text per org/date); `conversations` + per-owner memory; `autonomy_state` (branch × track: rung, criteria measurements, enablement, caps); `llm_call_log` (gateway); eval fixtures + results (repo).
- **Events emitted / consumed:** per §2. `alerts`, `briefs`, and `autonomy_state` are projections of their event chains.

## 6. Non-functional requirements (module-specific)

- 13-N1 Brief generation completes for every org within 30 min of its trigger at 200-org scale; metric computation p95 < 2 s per metric on baseline infrastructure.
- 13-N2 Analyst: first streamed token p50 < 5 s; complete answer p95 < 20 s including metric execution.
- 13-N3 Alert latency: `alert.raised` within 5 min of the triggering event's cloud arrival.
- 13-N4 Autonomous-action safety: auto-actions are rate-limited (one auto-pause per channel per 30 min; auto-POs only within spend caps); every auto-action remains one-tap reversible for at least the current business day.
- 13-N5 Privacy: prompts never include customer phone numbers or PII beyond first names; org isolation (00 §5.4) is enforced at the gateway and covered by the injection evals.

## 7. Customizability

- **Layer 1 (platform admin, doc 15):** model-tier routing table; per-org LLM budget; max-rung cap per org; detector rollout flags.
- **Layer 2 (back office, doc 14):** alert thresholds within designed bounds; brief deadline; R4 enablement per capability + spend caps; analyst memory erasure.
- **Layer 3 (device):** none.
- **Deliberately not configurable:** the honesty guardrails — semantic-layer-only answers, refusal behavior, citations, announcement + reversibility of autonomous actions; rung unlock criteria (platform constants, changed only by revising this spec); the append-only `action.*` audit chain.

## 8. Tech notes

- Anthropic Claude API via the official TS SDK; tool-use (structured metric calls) for planning; streaming to surfaces over the existing tRPC/WebSocket paths. Verify the current model lineup at build time for the 13-F31 routing table.
- Runs inside the modular Node backend (no microservice split, 00 §3); scheduled work on BullMQ; metrics execute against Postgres read models via Drizzle — SQL lives only in reviewed metric definitions.
- Baseline math is plain SQL/TS statistics — no ML infrastructure until 13-F13 justifies it with a measured gap.
- Eval harness runs in CI (Vitest) with recorded LLM fixtures plus a nightly live-model run; the injection corpus grows from every observed field attempt.

## 9. Open questions

1. Brief tone calibration for the Lahore beachhead — decide from pilot feedback.
2. ~~Voice-note questions~~ **Settled (July 2026):** owner voice notes are transcribed by doc 07's pipeline (07-F24) and reach the analyst as text in Wave 4; low-confidence transcripts get a clarifying English reply, never a guessed answer.
3. Exact demotion hysteresis (13-F27) to prevent rung flapping around a criterion boundary — tune at pilots.
4. Whether the staffing track should ever climb past R2 (auto-scheduling proposals), or cap there permanently.
5. Conversation-memory cost model (context growth): summarize-and-pin vs sliding window — decide at build with measured token costs.
