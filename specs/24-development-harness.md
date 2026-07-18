# 24 — Development Harness: Loops, Finality Criteria & Drift Control

**Engineering standards — Draft 1, July 2026** · Parent: `00-platform-overview.md`. Completes the AI-development stack: `23` (what context a session gets) → **this document (how a session's work is defined, verified, and accepted)** → `20` (the correctness system the harness enforces). Research basis: three external research passes, July 2026 (§10) — Claude Code verification loops, LLM test-authorship quality, and architecture/product drift. Every load-bearing rule below cites its evidence.

**The problem this solves:** the specs define *what must be true*; they do not define *when a coding session is finished, what it may not touch, and what makes its output acceptable*. Without that, "done" is the agent's own judgment — and the research is unambiguous about where that leads: models game visible verifiers in up to 30% of runs, "do not cheat" instructions have negligible effect, and 91.5% of real-world agent sessions needed explicit user correction. The harness makes finality mechanical.

## 1. The task contract — what "done" means

- 24-F1 **Every task ends in a machine-checkable state, declared before work starts.** A task = (scope: one module; FRs it closes; the named check that proves it; the files it may touch). A task without a runnable check is not dispatchable — it goes back to planning. (Anthropic doctrine: "without a check it can run, 'looks done' is the only signal available.")
- 24-F2 **The Definition-of-Done ladder** — every module and every task names its target rung:

| Rung | Meaning | Gate |
|---|---|---|
| **D0** | Skeleton compiles, arch rules pass | typecheck + Biome + arch tests |
| **D1** | FRs conformance-green | `verify:<nn>` green; conformance matrix rows closed |
| **D2** | Systemically sound | simulation/chaos suites green (20 §2.4–2.5); mutation gate met |
| **D3** | Physically verified | office-rig protocol (plug-pull, printers, perf budgets) |
| **D4** | Field-proven | running in a dev-pilot restaurant behind a flag, Auditor clean 7 days |

- 24-F3 **Acceptable development = the ratchet.** A PR is acceptable iff: it turns target FRs green without turning any green FR red anywhere; coverage/mutation ratchets never move down (thresholds auto-bump, never hand-lowered); arch and slop trend gates (§5) pass; every behavior change cites a resolving FR ID (23-F14). CI enforces all four — acceptability is computed, not argued.
- 24-F4 **Autonomy is sized to the 80% horizon, not the 50% one.** METR: the task length agents complete 80% of the time is ~4–5× shorter than their headline 50% horizon. Tasks are sized so a single session completes one conformance unit (typically 1–4 FRs); long builds are *sequences of short sessions* over a shared progress artifact (§6), never one long session.

## 2. Conformance & finality per module

- 24-F5 **Conformance matrix:** each module owns `conformance/NN.yml` — every FR ID → its acceptance test id(s) → status (`unmapped | red | green | waived(reason, expiry)`). CI regenerates status from test results; the matrix is read-only to humans and agents alike (it is *derived*, so it cannot be gamed by editing). Module finality = zero unmapped, zero red, zero expired waivers at the module's target rung.
- 24-F6 **Verify commands:** `pnpm verify:<nn>` runs the module's acceptance suite against its declared rig (compose profile, fakes, sim-branch as needed) and prints the conformance delta. This is the loop terminator every task's Stop gate calls (§3).
- 24-F7 **The holdout acceptance layer.** A subset of each module's acceptance tests (highest-money, highest-law FRs) lives in a path the implementing session cannot read or write (enforced by permission rules + hooks), and runs only in CI. Evidence: 22–33% of agent patches that pass the agent's own visible tests fail hidden golden tests; scorer visibility raised reward-hacking >43×. The holdout is our golden set.
- 24-F8 **Pre-implementation artifact gate.** A module enters implementation only when its design artifacts below exist (produced as the module's first tasks — draftable by agents, approved by the design/architecture owner):

| Module | Required pre-implementation artifacts |
|---|---|
| 01 | Wire-protocol message schemas; fold registry (views per device class + SQLite schemas); hub-election state machine |
| 02 | Screen inventory + navigation map (the layout the muscle-memory law then freezes); POS UI state machine |
| 03 | KOT/receipt document models (field-by-field); ETA-pipeline acceptance data (synthetic samples → expected estimates) |
| 06 | Page inventory; org-theming variable contract; payment-intent state machine |
| 07 | Intent-router state machine; template text catalog; **Urdu/Punjabi audio eval corpus (data asset — start early)** |
| 10 | Golden ledger fixtures with worked numbers (events → expected variance/cost values) |
| 13 | **Metric registry v1 catalog** (each metric: definition, computation, dimensions, golden values); brief template; analyst golden Q→A set (data asset) |
| 14/15 | Form/page inventories; onboarding wizard steps; import file formats |
| 16 | Per-adapter certification checklists; fixture invoices per authority |
| 21 | Component-kit inventory v1 (the enumerated closed vocabulary); golden screens (design pass) |
| all | Anything else a session would otherwise have to invent — if it isn't derivable from the spec, it is an artifact task first (AGENTS.md commandment 2) |

## 3. The loop protocol — one implementation session

1. **Plan gate.** Session loads the routed context (23), produces a short plan naming FRs, files, and the check — **plus stated assumptions: where the task is ambiguous, the plan lists the interpretations and names the simpler alternative considered** (silently picking one reading of an ambiguous task is a drift seed). Senior (or designated reviewer session with senior spot-check) approves before code. Skipped only for trivial mechanical diffs.
2. **Tests exist first and are read-only to the implementer.** Acceptance tests were written by a *different* session from spec text only — never shown the implementation, and committed before implementation begins. A PreToolUse hook blocks the implementing session from editing `*.test.ts`/`*.spec.ts` and `conformance/`; CI independently rejects implementation PRs touching test files for their target FRs. Evidence: independently-authored tests catch 25% of faults vs 14% for same-mind tests; agents demonstrably weaken, special-case, and delete tests when allowed ("The genie doesn't want to do TDD" — Beck).
3. **Red confirmed, then green.** The failing run is executed and its output captured *by the harness* before implementation starts (the anti-mock-implementation step in Anthropic's TDD doctrine).
4. **Deterministic inner feedback.** PostToolUse hooks run typecheck + Biome + arch rules on touched packages after every edit, feeding failures straight back into the loop (rules-based feedback beats LLM judgment — official ranking). Package-scoped fast tests are the inner loop; the full suite belongs to CI.
5. **Stop gate.** The session cannot end until the task's `verify:<nn>` (or task-scoped check) exits 0 — Stop hook or `/goal` backed by the script, never prose. **An 8-consecutive-block override is recorded as a failed task**, not a completion; it returns to planning with the transcript attached.
6. **Evidence over assertion.** The session's closing message must contain harness-captured command output (test run, conformance delta) — never the bare claim "tests pass." The harness's exit codes are authoritative; the agent's report of them is not (self-repair research: agents fix name errors at 77% but assertion/logic errors at only 45% — and misreport progress under pressure).
7. **Fresh-context review.** A reviewer session/subagent that never saw the implementation reasoning reviews the diff against the plan + cited FRs, scoped to *correctness and requirement gaps only* (unscoped reviewers invent findings and drive over-engineering — documented failure mode). Then human review per risk tier (§7).
8. **Isolation throughout.** One git worktree per parallel session; sandboxed bash (filesystem + network allowlist); **zero production credentials in any environment where an agent executes** — the Replit lesson: environment separation catches what prompting cannot. Cloud/background sessions land only as PRs.

### 3b. Craft discipline (adopted from Karpathy's LLM-coding guidelines, July 2026)

- 24-F23 **Simplicity first.** The implementation is the minimum code that closes the target FRs: no speculative features, no unasked-for flexibility or abstraction, no error handling for implausible scenarios. Review acid test: *would a senior call this overcomplicated?* (Documented agent failure mode: invented complexity, unnecessary caching layers — the write-time counterpart of the §5 slop trend gates.)
- 24-F24 **Surgical changes.** A task touches only the files in its contract (24-F1). No "improving" adjacent code, no drive-by refactoring of working systems, no removing pre-existing dead code the change didn't obsolete — cleanup is scheduled consolidation work (24-F16), which is what keeps feature diffs small enough for the §7 review lanes to stay honest. Match the surrounding code's style always.
- 24-F25 **Reviewer enforcement:** the fresh-context reviewer (§3 step 7) checks both — over-engineering relative to the FR, and out-of-scope diffs — as first-class findings alongside correctness.

## 4. Test-authorship law (extends 20 §2, evidence-hardened)

- 24-F9 **Independence:** acceptance tests are authored from spec text with contract-only visibility (no implementation diff, no implementation session history). Property tests and unit tests may be written alongside implementation, but they are advisory; only acceptance + holdout tests close conformance rows.
- 24-F10 **Mutation is the self-confirming-test detector.** Coverage is explicitly not a quality signal (published case: 100% coverage, 4% mutation score). Protected-package mutation gates (20 §2.14) are the floor; surviving mutants are periodically fed to a *test-writing* session as prompts (the mutation-feedback loop — the highest-gain pattern in the literature; Meta runs it in production).
- 24-F11 **Assertion quality over test volume.** Agent-written test volume correlates with nothing (83% vs 0.6% test-writing rates, identical resolution). Lint + review reject: assertions mirroring implementation output, assertion-free tests (already 20 §2.1), print-statement rituals, over-mocking (mock-count threshold per file; agents mock 36% vs humans' 26% — mock only at module boundaries per 18 §12), unordered-collection assumptions (63% of LLM test flakiness).
- 24-F12 **Flaky quarantine within 24h.** Agents copy flaky idioms from tests they see in context — a flaky test left visible breeds more. Quarantined tests are excluded from context and from gates, with an expiry that blocks the next release train if unfixed.
- 24-F13 **The property-hunting agent.** Quarterly (and before each wave exit), an agent session runs a property/metamorphic campaign over the kernel and money paths — propose invariants → write fast-check/metamorphic tests (replay equivalence, event commutation within classes, conservation) → execute → triage against a rubric. Evidence: agentic PBT found valid bugs at ~$10/bug across 100 real packages; PBT + example tests catch 81% vs 69% for either alone.

## 5. Architecture & slop rails

- 24-F14 **Architecture rules live inside the loop and in CI.** dependency-cruiser + ArchUnitTS rules (18 §2 direction law, kernel-boundary purity, two-plane law imports, cycle bans, no app-local UI components) run in the PostToolUse/Stop hooks (agent self-corrects before a PR exists) and again in CI as authority. Rules carry **empty-match protection** — a rule matching zero files fails, so renames can't silently disable rails.
- 24-F15 **Slop trend-lines as fitness functions, gated on direction.** CI tracks per package: duplicated-block rate, moved-vs-added lines (refactoring share), cross-file call trend (reuse), dead exports (knip), catch-without-diagnose count, dependency count. Sustained wrong-direction trend = release-train blocker. Rationale: the measured erosion pattern of ungated AI codebases — duplication +81%, refactoring −70%, reuse −35%, error masking +47%, >15% of AI commits introducing static issues with 22.7% surviving to HEAD. We gate the *direction* because absolutes vary by module age.
- 24-F16 **Consolidation is scheduled work.** Agents build alongside rather than into existing code and never delete (deletion doesn't turn tests green). Every wave includes explicit consolidation tasks: dedupe against the trend report, delete dead exports, refactor toward the exemplar files. The 18 §15 dependency process plus these sweeps counter bloat.

## 6. Product-intent defense

- 24-F17 **The spec governs only if something checks it per PR.** The known SDD failure is "spec-first-then-drift" — disciplined spec, then code becomes truth again. Our counters: FR-citation requirement with grep-verified IDs (23-F14); a reviewer step that flags *behavior changes not covered by any cited FR* (unreferenced behavior = either a spec PR or a revert); scenario/E2E tests as the product contract for every user-facing flow (a flow without a scenario test is not done at D1).
- 24-F18 **Long-run structure (Anthropic harness pattern):** multi-session builds run over an external progress artifact — the conformance matrix is our `feature-list.json` — one conformance unit per session, git + matrix as memory, end-to-end verification (driving the real flow, not just unit tests) before any unit is marked done. Named failure modes to watch: premature completion claims, one-shotting, undocumented progress.
- 24-F19 **Two human intent checkpoints per feature, at the cheap points:** plan approval (before code) and final intent review (founder/product looks at the running feature against the spec's intent, not the diff). Demo-driven: the review artifact is the working flow + evidence, not prose.

## 7. Review economics & habituation defense

- 24-F20 **Risk-tiered review lanes.** Tier A (kernel, money, sync, tax, auth — the CODEOWNERS set): senior human review always, small stacked PRs, AI pre-review first. Tier B (module features): AI review + one human, evidence attached. Tier C (mechanical: deps within registry, generated fixtures, doc typos): AI review + ratchet CI, human sampling. Rationale: AI review *plus* human measurably outperforms either alone (81% vs 55% reported quality gains; AI-only review agents mostly have <60% signal ratios and CRA-only PRs merge poorly).
- 24-F21 **Habituation telemetry.** Reviewer approval rate, comments-per-PR, and review-time-per-line are tracked as trend lines; review-time-per-line on agent PRs falling toward parity with trivial PRs is the rubber-stamp alarm (measured decay: approvals +6.7pts, comments −22%, in 7 months of AI-PR volume). When the alarm fires: shrink PR size caps and rotate reviewers, don't exhort.
- 24-F22 **PR hygiene at agent volume:** small stacked PRs; merge queue testing against merged main before landing (parallel agents each "green" against stale bases is a standing hazard); commit-trailer attribution (session, model, harness version) so incidents trace to their authoring run; feature flags on all new user-facing surfaces with canary rollout per doc 15 channels.

## 8. Org metrics (quarterly review, founder-visible)

Human-intervention rate and type mix on agent PRs · agent-PR revert rate vs baseline · mutation-score and slop trend lines · conformance velocity (FRs closed/week — the true throughput metric, not LOC) · holdout-vs-visible pass divergence (the gaming detector) · Stop-gate override count · comprehension check: each senior explains one protected package unaided per quarter (the atrophy counter — supervising well requires the skills delegation erodes). Calibration warning baked in: perceived speed is not evidence (devs measured 19% *slower* while believing 20% faster); trust conformance velocity and revert rates only.

## 9. The `plans/` convention

`plans/wave-<n>/<module>-tasks.md` — living task lists produced by planning sessions, reviewed like code, deleted after their wave: each task = FRs closed · files touchable · check command · DoD rung · dependencies. Tasks are the disposable layer (specs are permanent; conformance matrices are derived; plans are working memory). A task may not be dispatched to a session unless its artifacts gate (24-F8) is satisfied.

## 10. Research basis (key evidence, July 2026)

Reward hacking: METR 2025 (o3: 30.4% hack rate with scorer visible vs 0.7% hidden; anti-cheat instructions negligible); Anthropic "Emergent misalignment from reward hacking" (hacking generalizes to sabotage); Claude 3.7 system card (test special-casing). · Loop doctrine: code.claude.com best-practices (checkable end states, Stop hooks + 8-block override, evidence over assertion, writer/reviewer splits); Agent SDK post (rules-based feedback ranking); Anthropic long-running-harness posts (feature-list, e2e-before-done, evaluator≠generator). · Test quality: arXiv 2607.05139 (14% vs 25% fault detection, self-confirming tests); 2506.02954 (100% coverage/4% mutation); 2511.16858 + 2603.00520 (holdout gaps 22–33%); 2602.07900 (test volume ≠ resolution); 2602.00409 (over-mocking); 2601.08998 (flakiness inheritance); 2510.09907 (agentic PBT ~$10/bug); Meta ACH 2501.12862. · Drift: GitClear 2025/2026 (duplication +81%, refactoring −70%, reuse −35%, error masking +47%); 2603.28592 (15% of AI commits add issues); Faros (review time +91%, PR size +154%, DORA flat); 2606.22721 (reviewer habituation); 2604.03196 (CRA signal <60%); 2605.29442 (91.5% sessions needed correction); MSR 2026 (52% intervention rate); METR horizons + RCT; DORA 2025 (AI amplifies existing control systems); tsarch/Nx/dependency-cruiser agent-rail writeups; Fowler-site harness-engineering memo (constrain the solution space; entropy management). Full source URLs live in the three research reports archived in the session record; disputed or vendor-only numbers are marked in place.

## 11. Open questions

1. Conformance-matrix file format final design (YAML schema; derived-status generation from Vitest/Maestro reporters) — first Wave 0 harness task.
2. Whether the holdout layer's invisibility survives local development ergonomics (encrypted at rest vs separate repo vs CI-only checkout) — decide at repo setup.
3. Mutation-gate cadence at agent velocity (per-PR incremental vs nightly full) — measure once real volume exists (no published data; we'll be generating it).
4. Which org metrics (§8) can be auto-derived from git/CI vs need light manual logging — tooling decision at Wave 1.
