# 21 — The UX System: Role-Grounded Design Under AI Code Generation

**Engineering standards — Draft 1, July 2026** · Parent: `00-platform-overview.md`; extends `18-engineering-handbook.md` §7–§8 and `20-testing-correctness.md`. Research basis: HCI literature, vendor documentation, and practitioner sources verified July 2026 (§9).

**The problem this document solves:** AI-generated UI passes automated tests while being inconsistent, cluttered, or nonsensical for a real human — a cashier at transaction 67 of a Friday shift, a chef reading a screen from two meters with wet hands, an owner glancing at a phone for two seconds. Tests verify behavior; nothing so far verifies *sense*. The published evidence says the answer is NOT "have AI review the design" (vision-LLM critique produces ~13% valid design comments zero-shot, ~50% of expert quality even with few-shot tuning — UICrit, UIST 2024). The answer is the same move as doc 20: make UX quality *structural and checkable* — constrain what AI can generate, measure what can be measured, and put real staff in front of the rest.

## 1. The five defense layers (ranked by strength of evidence)

| # | Layer | Mechanism | Catches |
|---|---|---|---|
| 1 | Closed vocabulary (§2) | Compile-time + lint; deterministic | Random components, token drift, inconsistency |
| 2 | Catalog + visual diff (§3) | Every state a story; every pixel change a human-reviewed diff | Silent visual drift, layout breaks |
| 3 | Numeric UX budgets (§4) | Measurable merge criteria per role | Slow flows, small targets, cluttered screens |
| 4 | Role contracts & relevance (§5) | Per-role task inventories + usage instrumentation | Screens that make no sense for the person using them |
| 5 | Real-staff RITE testing (§6) | Weekly observational tests in our own restaurants | Everything the machine can't judge — the actual answer to "passes tests but nonsensical" |
| — | Vision-LLM critic (§7) | CI screening pass, advisory only | A useful net; never a gate |

## 2. Layer 1 — Closed component vocabulary (deterministic)

The established practice (Builder.io, Atlassian, shadcn Skills): **executable rules beat prose — your codebase is the prompt.** AI assembles screens from a fixed kit; it never invents components.

- 21-F1 `packages/ui` exposes **semantic components** (`<PosGridButton>`, `<TicketCard>`, `<MoneyText>`, `<ApprovalSheet>`), not styled primitives. Props are strict discriminated unions — invalid combinations fail typecheck *inside the AI's own verify loop*.
- 21-F2 Raw primitives are banned in app code: Biome `noRestrictedImports` blocks direct `react-native` `<Pressable>/<Text>` and raw HTML elements in feature screens (allowed only inside `packages/ui`).
- 21-F3 Token enforcement: Tailwind/NativeWind **arbitrary values are banned in app code** (`p-[13px]`, `text-[#ff0000]`) — a custom lint script greps and fails CI. Research finding this prevents: models "approximate instead of referencing tokens" (writing the training-data-average padding instead of ours).
- 21-F4 A **golden directory** (`apps/*/golden/`) holds 3–5 production-grade reference screens per app; AI sessions are pointed at golden screens, the module doc, and this document — never asked to design from imagination.
- 21-F5 New component = a `packages/ui` PR with design-owner review (§8) + stories for every state (§3). An app-local one-off component is a lint error.
- 21-F6 The component manifest (props, stories, usage notes, deprecations) is machine-readable and injected into AI sessions (Storybook's agent-manifest pattern); deprecated components are excluded so AI cannot learn them.

## 3. Layer 2 — Catalog & visual regression

- 21-F7 Every `packages/ui` component and every screen-level state has a story. Web: Storybook 9 (interaction + a11y + visual under Vitest). RN: Storybook RN — which has **no built-in visual testing** (verified limitation) — so RN visual regression runs as **Maestro screenshot flows on the office rig**, with baselines in git.
- 21-F8 Baseline discipline (from doc 20 §2.8, extended): baselines update only via reviewed PR; "updating the baseline to make CI pass without inspecting the diff" is treated as falsifying a test. Dynamic content masked; component-level screenshots preferred; thresholds start at `maxDiffPixelRatio 0.01`.
- 21-F9 Web visual diffing: Chromatic on Storybook (default choice; Argos/Lost Pixel are the cost fallback — revisit at fleet scale). RN remains the weak link industry-wide; the rig-based Maestro suite is our compensation, and it runs on reference hardware, which Chromatic never would.

## 4. Layer 3 — Numeric UX budgets (merge criteria, not aspirations)

Budgets are checkable by script, story metadata, or Maestro step-count — immune to AI plausibility. Sources: Material 3, WCAG 2.2, latency and glanceability research (§9).

| Budget | Value | Applies to |
|---|---|---|
| Touch target floor | 48×48dp (≥8dp gaps) | Everything staff-facing; WCAG 24px is the absolute legal floor, never the design target |
| Primary action targets | ≥64dp | POS menu grid, KDS bump targets, rider status buttons |
| Touch feedback latency | <100 ms on reference hardware | All operational surfaces (00 §5.3 restated as perceptual threshold) |
| Simple order → KOT | ≤2 taps | POS (existing law, now Maestro-counted per release) |
| Named-task tap/time budgets | Declared per flow in module docs | Settlement ≤4 taps; rider settlement ≤3; count entry ≤3/item (10-N2); violations = merge blockers |
| Glance budget | Key message in 1–2 s (research: >70% of dashboard sessions are ~5 s) | Owner tiles, KDS tickets, manager alarms — one emphasized number per view |
| New-cashier learnability | <15 min to first clean order | Release-train check with a staff member who's never seen the build |

## 5. Layer 4 — Role contracts: relevance by construction

The direct answer to "how relevant is the system for each role": every screen belongs to exactly one role and serves a task from that role's inventory. No screen exists without a role + task + budget. Feature tourism (surfacing capabilities to a role that doesn't need them) is a spec violation.

**Per-role design laws** (research-grounded; each role's laws live with its module doc, seeded here):

- **Cashier (02):** muscle memory is a compatibility contract — the field benchmark that scored POS systems found the winner *preserves navigation structure across releases* ("cashiers cannot operate on muscle memory when the path to an action is not predictable"). Therefore: **layout/navigation changes to operational screens are breaking changes** requiring explicit justification in the PR and a dev-pilot acclimation period. Numerals everywhere (prices, tables, qty) — digits are readable by many who cannot read words (Medhi et al.). Grid positions stable; search as escape hatch; required modifiers block send (Toast pattern).
- **Kitchen (03):** design for 1–2 m reading distance and wet hands. Ticket age = color (neutral base → amber at expected-prep → red overdue; thresholds org-configurable; color is reserved for exceptions per the preattentive principle — canonical in 03-F14, this law and that FR must match). Icons + numbers dominant, minimal words (low-literacy law); semi-abstract icons beat photos and minimal glyphs (Medhi). **No published KDS legibility standard exists** — font-size-at-distance gets derived from signage math and validated in our own kitchen (§6). Bump-bar hardware support stays on the roadmap for high-volume kitchens (touchscreens and greasy hands conflict).
- **Waiter (04):** one-hand thumb-reach zones; sunlight-legible contrast; the app is a remote control, not a browser — one primary action per screen state.
- **Rider (09):** big targets, outdoor contrast, offline-honest status; numerals-first (COD amounts).
- **Owner (12):** one emphasized number per tile; comparison-to-baseline framing ("↑ 12% vs last Friday"); progressive disclosure; 1–2 s glance budget.
- **Language law (all surfaces):** **English only** (00 §5.6, launch decision). The load this puts on partially-literate staff is carried visually, not linguistically: labels are short and paired with icons, numerals carry the operational information (digits are readable by many who can't read words — Medhi), and **visual position is the real interface** — staff memorize where things are, which is why the stable-layout law above is a hard rule, not a preference. The Nastaliq/Naskh research (§9) stays on record for the day a second language is added. Sole exception: customer chat (WhatsApp/social DM) understands roman-Urdu and voice input from day one and replies in English; bilingual replies are a later, eval-gated stage (07-F22..F24).
- **Interrupt priority law (all operational surfaces — POS, pass/KDS, manager console):** every attention-demanding signal declares one of three severities, with platform-fixed behavior. **S1 alarm** (print failure, red late-order, unaccepted cloud order past half its window, critical cash variance): full-screen or persistent banner + repeating distinct sound, repeats until acknowledged, escalates to the manager console if unacknowledged 60 s. **S2 attention** (amber aging, new cloud order, support message, approval request): chime once + badge; re-chimes on threshold escalation only. **S3 info** (sync status, ETA updates): silent visual only. One sound vocabulary platform-wide (an S1 sounds the same on every device); same-cause signals dedupe to one active interrupt; acknowledgment is attributed and logged. No module invents its own alarm behavior — new signal types are assigned a severity here.
- 21-F10 **Relevance instrumentation:** every screen emits per-role usage analytics (screen, role, task completion, taps, duration). Quarterly review: screens with near-zero use by their role are candidates for removal — relevance is measured, not assumed. Time-on-task and taps-per-task are release-over-release regression metrics (a user who still succeeds but 3× slower is a regression success-rate hides).

## 6. Layer 5 — Real-staff testing (the human gate)

The only layer that catches "passes tests but nonsensical in a rush." Protocol, from Nielsen/RITE/ICTD literature adapted to our unique asset (our own restaurants):

- 21-F11 **RITE method, weekly during active UI development:** 3–5 participants *per role* per round (five roles ≈ 15–20 people across rounds — the 5-user rule is per user group, per iteration); fix issues immediately — sometimes after a single participant — and verify the fix with the next.
- 21-F12 **Observational, not think-aloud:** task success + observation, conducted in Urdu/Punjabi by someone culturally local (the ICTD finding: verbal protocols underperform with low-literacy Global-South participants; Medhi's 400-subject program was observational). Tasks are real: "Table 4 wants two karahi, one less-spicy, and a Coke — ring it."
- 21-F13 **Rush shadowing:** per release train, one engineer observes a real Friday rush on the dev-pilot build. Every workaround staff invent (paper notes, shouting, skipping the system) is filed as a UX defect — staff workarounds are the highest-signal bug reports we will ever get.
- 21-F14 Learnability check (§4 table) with a genuinely fresh staff member per train.

## 7. Vision-LLM design critic — screen, never gate

A CI job screenshots changed screens (Playwright web; Maestro RN) at phone/tablet viewports and has a vision model critique them against this document + the role laws, with few-shot examples of good/bad from our own golden screens (few-shot + coordinate grounding improved critique validity 55% in UICrit — still ~0.48 vs 0.75 expert quality). Output is an advisory PR comment. **Rule: the critic can request human attention; it can never approve, and it can never block alone.** Its comments are periodically audited against what human review and staff testing actually found; if precision stays low, we cut it without ceremony.

## 8. Design authority

A 4-person dev team has no designer, and committee-designed UI under AI generation drifts fastest. Therefore: one senior is the **design owner** — final call on `packages/ui`, tokens, golden screens, and role laws; CODEOWNERS on `packages/ui` alongside doc 20 §4.4 paths. Open question §10.1 covers contracting a professional designer for the foundational pass.

## 9. Sources (key)

UICrit (Duan et al., UIST 2024) — vision-LLM critique validity numbers · Builder.io "make AI agents follow your design system"; Atlassian `ensure-design-token-usage`; shadcn Skills; Storybook 9 + agent manifests + RN testing docs · Toast POS/KDS vendor docs (ordering screens, warning colors, offline hub); creative.navy POS UX benchmark 2026 ("coherence gap", navigation stability) · Medhi Thies et al. (MSR India, TOCHI) text-free UI corpus — text unusable for first-time low-literacy users; semi-abstract icons win; digits readable · Material 3 touch targets; WCAG 2.2 SC 2.5.8/2.5.5; touch-latency perceptibility (~100 ms, arXiv 1608.05654) · Glanceability research (1–2 s; ~5 s sessions) · Nielsen 5-user rule (per group, per iteration) + Woolrych/Cockton critique; RITE method; ICTD think-aloud adaptation (arXiv 2501.05840) · Nastaliq/Naskh legibility trade-offs; Noto Nastaliq Urdu; ESC/POS bitmap printing for Urdu.

## 10. Open questions

1. Contract a designer for the foundational design-system pass (tokens, golden screens, component kit visual language), with the design owner maintaining it after — decide before Wave 1 UI work begins.
2. KDS font-size-at-distance numbers: derive candidate sizes from signage legibility math, then physically validate in the dev-pilot kitchen — the published literature has nothing (we are inventing here; write down what we measure).
3. Chromatic vs Argos cost at scale — revisit when story count makes it material.
4. Whether bump-bar hardware support enters doc 03's scope for high-volume kitchens (research says yes above ~100 tickets/service; our beachhead may never hit that — dev-pilot data decides).
