# 20 — Testing, Environments & the AI-Correctness System

**Engineering standards — Draft 1, July 2026** · Parent: `00-platform-overview.md`, expands `18-engineering-handbook.md` §12. Answers three questions with binding rules: what our environments look like (and where Docker fits), every kind of testing we run and when, and how the system stays correct when AI writes most of the code.

---

## 1. Environments — where Docker fits (and where it doesn't)

**Rule: Docker for infrastructure and topology; in-process for logic.** Containers are the right tool for "run a realistic system"; they are the wrong tool for the thousands of fast iterations that logic tests need.

| Environment | What runs where | Purpose |
|---|---|---|
| **Local dev** | Infra in `docker-compose` (Postgres, Redis, MinIO, plus the integration fakes from `packages/testing` as compose services: WhatsApp fake, foodpanda mock driver, FBR fiscalization simulator, virtual printer server). Our own services/apps run natively (`tsx watch`, Vite, Expo) for instant reload. | Day-to-day development. Rule: no developing against shared cloud databases, ever. `pnpm dev` brings up the whole thing. |
| **Sim-branch (in-process)** | N `sync-client` instances instantiated in one Node process with an in-memory/temp-SQLite adapter and a **virtual scheduler** (§2.4). No containers. | Property and simulation tests of the sync engine and folds. Thousands of runs per CI job. |
| **Sim-branch (containerized)** | Compose profile: `sync-gateway` + `api` + Postgres + 3–5 headless device containers (real SQLite, real WebSockets) + **Toxiproxy** between every link. | Full-stack chaos E2E: WAN cut mid-rush, partition/rejoin, latency spikes, hub failover. The 01 §8 spike exit criteria run here, scripted. |
| **CI** | GitHub Actions; **Testcontainers** (real Postgres/Redis per run — mocked infra in service tests is banned); containerized sim-branch for the E2E suite; EAS builds for RN. | Every PR: static + unit + property + contract + snapshot. Nightly: simulation (long seeds), chaos E2E, mutation testing, full-ledger replay. |
| **Office rig** | Physical reference hardware (00 §4): cheap tablet, low-end phone, old Windows PC, real printer set, controllable smart plug for power-cut automation. | Maestro E2E on real devices, printer compatibility runs, the plug-pull protocol, perf budget measurement. Release-blocking checklist per train. |
| **Staging cloud** | Production-shaped deployment, fake orgs, load generator. | Pre-release soak; migration rehearsal against a masked snapshot. |
| **Dev-pilot restaurants** | Real branches on the `dev-pilot` rollout channel (doc 15). | The only place reality is tested. Feature flags + kill switches; diagnostics bundles on demand. |

## 2. The testing taxonomy — every kind, what it covers, when it runs

### 2.1 Static (every PR, seconds)
Typecheck (strict, §18-3), Biome lint, dependency-direction check, license allowlist, banned-pattern lint (raw `process.env`, `console.log`, direct SQLite from apps, physical `ml-*/mr-*` in shared UI, assertion-free test detection).

### 2.2 Unit (every PR)
Vitest. 100% branch coverage enforced on: folds, money/quantity arithmetic, permission `can()`, unit conversions, ESC/POS encoder, fiscalization state machine. Coverage elsewhere is informative, not gated — gates on the paths where a wrong branch is money or law.

### 2.3 Property-based (every PR)
fast-check. Mandatory for algorithmic code (§18-12). Core properties, maintained in `packages/testing` as named generators:
- **Fold determinism (01-N1):** any interleaving of a random event set (respecting per-device lamport order) folds to identical state.
- **Merge idempotence/commutativity:** applying the same event twice = once; A⊕B = B⊕A.
- **Conversion round-trips:** unit and money conversions never create or destroy value.
- **Protocol codec round-trips:** encode∘decode = identity for every message type.
Failing seeds are committed as regression cases; a property failure is never "flaky" — it is a bug with a reproducer.

### 2.4 Deterministic simulation (nightly + on sync-client PRs) — the crown jewel
FoundationDB-style: the sim-branch (in-process) runs under a **seeded virtual scheduler** that owns all time, network delivery, and crash injection. A run: generate a random restaurant day (devices joining/leaving, orders, state changes, availability toggles) → randomly delay/reorder/duplicate/drop messages, partition the LAN, kill and restart devices mid-write, skew clocks → run to quiescence → assert invariants (§4.2). Any failure reproduces exactly from its seed. Nightly runs execute thousands of seeds; the seed corpus of past failures runs on every sync-client PR. **Rule: no sync-engine change merges without a green simulation run; new sync features ship with new invariants.**

### 2.5 Chaos E2E (nightly, containerized sim-branch)
The same scenarios with real processes, real SQLite files, real WebSockets, Toxiproxy faults: 8-hour offline catch-up (< 60 s target), hub death and re-election (< 10 s), WAN flap during payment settlement, cloud-order queue flush on reconnect.

### 2.6 Durability & crash (nightly harness + release-train rig protocol)
Automated: `kill -9` injected at randomized points around event append/ack and print spooling; restart; assert the confirmed-means-persisted law (01-F2) and no partial writes. Physical (office rig, per release): power cut via smart plug mid-order and mid-print on both POS platforms; device must recover with zero confirmed-data loss.

### 2.7 Contract & cross-version (every PR touching sync-protocol; nightly matrix)
Shared golden fixtures in `packages/sync-protocol` consumed by both client and gateway test suites — the wire contract can't drift silently. Nightly compatibility matrix: client N−1 vs server N and vice versa (staged rollouts guarantee mixed fleets; 00 §6 schema-evolution rules are tested, not trusted).

### 2.8 Snapshot (every PR)
Receipts/KOTs rendered through the virtual printer to PNG — every layout change is a reviewed visual diff (column alignment and logo/QR raster regressions are invisible in code review otherwise). Component snapshots only for `packages/ui` primitives.

### 2.9 End-to-end (per release train; critical paths nightly)
Playwright: storefront order → kitchen queue; back-office onboarding wizard; approval flows. Maestro on office-rig hardware: POS rush flow, offline toggle mid-service, shift close, rider settlement.

### 2.10 Load & performance (nightly on staging; device perf per release)
The rush-replay generator (00 §4) at 1×/3×/10× realistic Friday load against staging — p95 assertions from 00 §5.3 are test assertions, not aspirations. Device-side: scripted order-entry loop on the reference tablet; frame drops and interaction latency recorded and compared to the previous release (regression = release blocker).

### 2.11 Migration (every PR containing a migration)
Postgres: migrations applied to a masked staging snapshot in CI; rollback rehearsed for read-model migrations. Device SQLite: fixture databases from **every previously shipped version** upgraded to head and integrity-checked — a bricked POS in the field is unacceptable.

### 2.12 Security & isolation (every PR touching auth; full suite nightly)
Exhaustive permission-matrix test: every role × action × scope from `domain` — generated, not hand-listed, so a matrix change reprices every test. Org-isolation suite: authenticated attempts to read/write across org boundaries through every tRPC procedure (generated from the router). Webhook signature rejection, replayed-event rejection, revoked-device lockout.

### 2.13 LLM evals (every prompt/model/metric change; doc 13)
Metric golden tests (fixture ledger → exact expected values); brief validator (every number in output traces to a metric call); analyst golden Q→A set scored for correctness + citation presence + honest refusals; prompt-injection suite (order notes and customer names containing instructions must never reach metric execution). Eval regression blocks deploy of the intelligence service.

### 2.14 Mutation testing (nightly; gate on protected packages)
Stryker on `domain`, `sync-client`, `escpos`, tax, and money paths. **This is the direct answer to "are the AI's tests real?"** — a test suite that kills < 85% of mutants on protected packages fails the nightly and blocks the next release train until repaired. Coverage says code ran; mutation score says assertions bite.

## 3. Why this architecture makes correctness *checkable*

The deepest defense is structural, decided back in doc 01: **append-only events + deterministic folds mean every derived state can be recomputed from scratch and compared.** Correctness of the running system is not a matter of trusting the code that ran — it is mechanically re-derivable. Everything in §4 exploits this.

## 4. The AI-correctness system

**Threat model of AI-written code:** plausible-but-wrong logic that type-checks; tests that execute but assert nothing meaningful; silent drift from the spec; hallucinated APIs; confident refactors that break invariants the diff doesn't show. Human threat: 4 reviewers can't deep-read every generated line. Defenses, in order of leverage:

### 4.1 Spec as executable contract
Module docs are the contract (18 §0). Before implementation, each FR gets acceptance tests written from the spec text; the FR id appears in the test name (`10-F7: variance values gap at moving-average cost`). A behavior change requires the spec edit in the same or a prior PR — CI flags PRs that change behavior-carrying code in a module with no spec-diff trail. AI sessions receive the module doc, not a paraphrase.

### 4.2 The Auditor (runtime self-verification)
A nightly cloud job per org: **refold the entire ledger from raw events with the current fold code and diff against the incrementally-maintained read models and last-reported device states.** Any diff = high-priority alert + release-train block. Plus continuous invariant checks, asserted inline in dev/staging (fail fast) and logged + alerted in production (never crash a service mid-service):
- Per-device lamport sequences gap-free; audit hash-chain unbroken (01-F5).
- Money conservation: Σ payments + Σ voids/comps/discount adjustments = order totals, per order and per day.
- Stock conservation: movements balance per item per location (counts are the only sanctioned discontinuity).
- State-machine legality: no order/fiscalization transition outside the declared machine.
The Auditor is the single highest-value correctness artifact we build. It ships in Wave 0 with the kernel, not later.

### 4.3 Test-quality enforcement
Mutation gates (§2.14); assertion-free-test lint; property tests mandatory for algorithmic code; coverage gates only where they mean something (§2.2). **Separation rule: the AI session that implements a change never writes its own acceptance tests** — tests come from a separate session/agent working from the spec, or from the senior. (Unit tests alongside implementation are fine; the *acceptance* layer is independent.)

### 4.4 Review lanes
Every PR: (1) adversarial AI review in a fresh context — prompted to find why the change is wrong, not to summarize it; (2) human senior review. CODEOWNERS enforces senior sign-off on protected paths: `packages/domain`, `packages/sync-client`, `packages/sync-protocol`, `packages/escpos` encoder, tax module, auth. Small-PR rule: one module, one concern; a PR touching > 2 packages needs a stated reason in its description.

### 4.5 Reality gates
No code path counts as "done" until it has run in the containerized sim-branch (for sync/ops features) or against the integration fakes (for drivers), and — per release train — on the office rig and a dev-pilot restaurant behind a flag. Weekly: doc-10 theoretical-vs-counted variance and Auditor reports from dev-pilots reviewed as *engineering* signal (unexplained variance may be our bug before it is their thief).

### 4.5b Relationship to the development harness
Doc `24-development-harness.md` operationalizes this system at the task level: the DoD ladder, per-module conformance matrices and `verify:<nn>` commands, the session loop protocol (tests read-only to implementers, Stop-gate finality, evidence over assertion), and the drift/slop trend gates. Where this document defines *what is tested*, doc 24 defines *when a session may claim done*.

### 4.6 Release gate checklist (per train, mechanical)
Green: PR suite · nightly simulation (zero failing seeds) · chaos E2E · mutation gates · migration suite · cross-version matrix · device perf non-regression · rig protocol (plug-pull + printers) · Auditor clean on staging and dev-pilots for 7 consecutive days. Any red = the train doesn't leave. No exceptions by seniority or schedule.

## 5. Tooling additions to the 18 §14 registry

`@stryker-mutator/core` + Vitest runner (mutation), Toxiproxy (Docker image + `toxiproxy-node-client`), `@faker-js/faker` (dev/test data only — never production paths), smart-plug control script for the rig (office tooling, not shipped).

## 6. Open questions

1. Simulation scheduler design: wrap fast-check's scheduler or build a dedicated virtual-clock harness in `packages/testing` — decide during the Wave 0 spike (bias: dedicated harness; fast-check drives generation, our scheduler owns time).
2. Mutation-testing runtime cost on CI — nightly full runs vs per-PR incremental (Stryker incremental mode) once the codebase grows.
3. Whether the Auditor also runs device-side (hub refolds its branch window nightly) — attractive for catching device-local corruption; costs battery/CPU on tablets. Decide after Wave 1 field data.
4. Masked-snapshot tooling for staging migration rehearsal (build vs adopt; PII masking rules for customer phone numbers).
