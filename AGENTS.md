# RestOS — Agent Guide

Restaurant OS for Pakistani restaurants. TypeScript monorepo (planned per `specs/18`), offline-first, event-sourced. **The specs are the contract: never code or edit from memory of a spec — open the owning doc first, per the routing table below.** Full context rules: `specs/23-ai-context.md`.

**Repo state (update this line when it changes):** Wave 0 in progress — the **kernel spike (01 §8) is COMPLETE**. `packages/{domain, sync-client, sync-protocol, testing}` + `services/sync-gateway` carry real, tested product code (T-01-00…T-01-07 + the T-01-06 exit run, all through the 24 §3 oracle→implement→adversarial-review loop). The spike exit run passed both binding rigs per DEC-TEST-002 — deterministic sim leg (X1–X9) + real-process smoke (3 processes, real WebSockets, real SIGKILL, Testcontainers Postgres). `verify:01` = **26 green / 0 red / 21 unmapped of 47** (Wave-0 scope declared in `conformance/wave-0-scope.yml`). Six W0-exit decisions accepted (`DECISIONS.md`). CI runs the full gate incl. Testcontainers on every push. **Remaining Wave 0:** T-01-08 quarantine pipeline, T-01-09 device auth, T-01-10 audit hash-chain (01-F5), T-01-11 Auditor, the H-01 harness rungs; physical wall-clock (p95, plug-pull) is D3. Protected-path commits await human senior review (CODEOWNERS). `pnpm verify` = docs-lint + typecheck + lint; `pnpm test` = the suites (Docker required for the gateway's Testcontainers).

**Two standing constraints every session must know (from the founder's kernel review):**
1. **`DEC-SYNC-004` is SUPERSEDED by `DEC-SYNC-009`.** The hub must relay WAN-less devices' events to the cloud. The shipped code still enforces the old no-proxy rule, so a LAN-only device (the normal case when only the counter terminal has internet) is **cloud-stranded** — its events never reach the merged log. Launch blocker, scheduled **T-01-12**. Code/comments citing DEC-SYNC-004 describe the superseded behaviour; don't patch them piecemeal, implement T-01-12.
2. **Money is integers-in-a-double.** Division and rates are where floats enter, and no divide/scale helper exists yet. The `DEC-MONEY-005` helpers (integer basis points, `splitPaisa`/`applyRateBps`, lint rule) must land (**T-01-13**) **before** any tax (16), discount (17) or split-bill (02) code is written.
3. **No ordering design is selected — and folds do not need a universal total order.** `spec 25 §18` is the live position: deterministic folds need deterministic *merge semantics* (commutative ops, monotonic state, explicit concurrency), not one global order. Today the universal comparator lets **sync metadata decide business outcomes** — cloud arrival order picks the winning table assignment and the anchoring timestamp. It is a delivery cursor, not staff intent. `causal_seq` is **refuted, do not implement** (`DEC-PERF-001` open). Until this resolves: **do not add new reads of `device_created_at`** — it is a raw untrusted clock read, not time and not order. `lamport_seq` is a per-device **gap-free** transport/audit counter and must not be repurposed as a causal clock.

## Commandments (always binding; each is also machine-enforced — violating code fails CI regardless of what you read)

1. **Append-only ledger.** Never mutate or delete history; corrections are new linked events (`01`).
2. **Never invent events, states, or policy.** Event types live in the `01 §4` catalog; order states in `01 §4` only. If the spec doesn't cover your case: STOP → check `specs/DECISIONS.md` → propose a spec change. Do not fill gaps with plausible behavior. **Any policy you assert must cite an FR ID that resolves** (`grep -rn "02-F9" specs/`) — an ID that greps to nothing means you invented it.
3. **Money = integer paisas; quantities = integer mg/ml/units.** Branded types from `domain`; floats in ledgers never (`00 §6`).
4. **Offline-first.** No in-branch feature may require WAN; confirmed = locally persisted before UI ack (`00 §5.1–5.2`). A sale is never blocked — not by inventory math, sync, or approval timeouts (`01-F17`, `05-F8`).
5. **Two-plane law.** Operational screens: `sync-client` reads/writes only. Cloud screens: tRPC + TanStack Query only. Never mixed silently (`18 §6`).
6. **UI = closed vocabulary.** `packages/ui` semantic components only; no raw primitives, no Tailwind arbitrary values in app code (`21 §2`).
7. **English-only UI; user content is Unicode** and renders/prints faithfully (`00 §5.6`).
8. **Server-side authorization always** via the `domain` permission matrix; client role claims are never trusted (`18 §5`).
9. **Spec change before behavior change.** Behavior-carrying code changes cite their FR ID (e.g. `02-F9`) in tests/commits; no matching FR = write the spec PR first (`20 §4.1`).
10. **Protected paths need senior review:** `domain`, `sync-client`, `sync-protocol`, `escpos`, tax, auth (`20 §4.4`).

## Routing — read the owning spec before touching its area

All docs in `specs/` (`NN-name.md`). `restaurant-os.md` = product vision + seed appendices (read for "why"/scope questions).

| Area | Owning spec | Usually also |
|---|---|---|
| Kernel: events, sync, money contract, auth, catalog | `01` | `19` (why custom), `20 §2.4` |
| POS / counter app | `02` | `01 §4`, `21` |
| Printing, pass screen, KDS, timing/ETA | `03` | `21` |
| Waiter app · Manager console | `04` · `05` | `21` |
| Storefront (QR/pickup/delivery, confirm policy) | `06` | `02-F9`, `07` |
| WhatsApp (doors, templates, voice, language policy) | `07` | `06`, `13` (analyst) |
| Foodpanda / aggregators | `08` | `02-F30` |
| Riders, dispatch, COD | `09` | `02`, `05` |
| Inventory, purchasing, counts, prep, forecasting | `10` | `01` money |
| Staff: attendance, advances, memory | `11` | — |
| Owner app · Intelligence/analyst/alerts | `12` · `13` | each other |
| Back office (layer-2 config) · Platform admin (layer-1) | `14` · `15` | `00 §7` |
| Tax / fiscalization | `16` | `01` money |
| Marketing & loyalty | `17` | `07` |
| Stack, packages, monorepo layout, code rules | `18` | — |
| Testing, environments, Auditor, release gates | `20` | — |
| Any UI/UX work (budgets, role laws, components) | `21` | — |
| Backup/DR, retention, erasure, export | `22` | — |
| Fold performance, incremental maintenance, retroactive reordering | `25` | `01`, `19` |
| Cross-cutting open/undecided questions | `DECISIONS.md` | — |
| This file's governance, agent context rules | `23` | — |
| Any build task: what "done" means, loop protocol, DoD, verify commands | `24` | `20` |

Cross-cutting laws (offline, performance, security, language, config layers): `00 §5–§7`. Doc conflicts: authority order in `00` header. Find an FR by grepping its ID (`grep -rn "02-F9" specs/`); unsure which doc owns a topic → search, don't guess.

## Working rules

- One module per session; load only the routed docs (a task needs ~2–4 specs, not the corpus).
- Build tasks follow the `24 §3` loop: approved plan → acceptance tests exist first (written by a different session; read-only to you) → implement → the named check passes → evidence (captured command output) in your final message. **"Done" is the check passing — never your own judgment.**
- Craft rules (`24 §3b`): **surface assumptions in the plan** (ambiguous task → state interpretations, name the simpler alternative — don't silently pick); **minimum code that closes the FR** (no speculative features, flexibility, or error handling for implausible cases); **surgical diffs** (touch only the task's files; never "improve" adjacent code — cleanup is scheduled consolidation work, not a drive-by).
- Editing a spec: follow the template in `00 §8`; new FRs continue the doc's numbering; never renumber or delete existing IDs.
- New event types / states / config keys: spec PR to the owning doc **and** `01 §4` / `00 §7` first, code second.
- Anything here that seems to conflict with a spec: the spec wins — and flag the drift so this file gets fixed.
