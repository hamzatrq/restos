# RestOS — Agent Guide

Restaurant OS for Pakistani restaurants. TypeScript monorepo (planned per `specs/18`), offline-first, event-sourced. **The specs are the contract: never code or edit from memory of a spec — open the owning doc first, per the routing table below.** Full context rules: `specs/23-ai-context.md`.

**Repo state (update this line when it changes):** Wave 0 kernel merged; Wave 1 work is on **`feat/wave-1-ui-foundation`** (14 commits ahead of `main`, not yet pushed — `main` itself carries Wave-1 UI commits from an earlier direct-to-main mistake and sits one ahead of `origin/main`). Suites green: **873 tests** (domain 137, sync-client 367, gateway 202 on Testcontainers, sync-protocol 62, testing 49, ui 43, pos-electron 13); `pnpm verify` exit 0. **Wave 1 is UI-first by founder ruling.** Its foundation is **complete**: four research passes → **`specs/27`** the design language (62 FRs incl. **§2b thermal paper**, discharging 27-F11h, the gap named as Wave 1's hardest problem) · **`plans/wave-1/role-task-inventories.md`** (114 tasks, 13 roles, 224 verified FR IDs) with **all ten §9 conflicts CLOSED and all seventeen §10.1 gaps dispositioned** (16 closed by spec or founder ruling; **G9** — call-center operator as mode vs role — deferred to Wave 4 with the question recorded) · **`plans/wave-1/screen-map.md`** the shell + IA derived from those tasks · **`specs/03-F30..F48`** the printed-document model (`DocumentSpec`/`DocumentProfile`) plus the three device failure modes that would otherwise have shipped. The `01 §4` **event-catalog absorption debt is cleared and machine-enforced** (docs-lint C6). **`packages/ui` is built:** 13 component files (the full `screen-map.md` §6 vocabulary + `AppShell`), 13 story files incl. the composed counter screen and 22" pass panel, 43 tests, Storybook 10 green; `tokens.test.ts` re-derives doc 27's arithmetic on every commit. An **adversarial round found 5 real defects** (opacity washes putting disabled-reason text at 1.97:1 and defeating `27-F4`; a destructive control below the 48 dp floor; `bgColor-` tokens used as foregrounds; a comment overstating its code; and the fix for the third, caught by the new guard) — all fixed, and `components/discipline.test.ts` enforces each structurally. **Training mode is answered and founder-ratified** — `DEC-TRAIN-001`/`01-F49..F51`: it is a *branch*, not a flag, so the kernel gains nothing. **The two kernel gaps that blocked the POS grid are closed:** the device catalog (`01-F52..F56`, `packages/sync-client/src/catalog.ts` — versioned snapshots/deltas, tombstone deletes, out-of-order delta refused) and item availability as a convergent fold (`01-F22`, `01-F57..F59`, `folds/availability.ts` — `supersedes` links + maximal set, because "latest wins" would need a clock or an id comparison, both banned by law 1). **`apps/pos-electron`:** `18 §9` process split, a typed IPC contract whose laws are what it *cannot* express (no query channel, no mutation channel), main-process gateway + 13 tests; findings in **`plans/wave-1/pos-shell-findings.md`**. **Owed on Wave 1, in priority order:** (1) an **independent oracle pass** over `packages/ui`, `rupeesFromPaisa`, the catalog, the availability fold and the `merge-workcounter` pin edit — all written implementation-and-tests in one session, which `24 §3` step 2 forbids, and three of them on protected paths (**in flight**); (2) the **catalog transport** — the device side stores/versions/refuses/degrades correctly and *nothing delivers to it*; needs org-scope pull over the sync channel (`01-F9`) and `catalog.changed` wired to a fetch; (3) **`apps/pos-electron` is not runnable** — no `electron.vite.config.ts`, no main entry, no renderer, so no RestOS screen has ever rendered on a device. **Remaining Wave 0:** the H-01 harness rungs + physical wall-clock (p95/plug-pull, D3 — the kernel has never run on target hardware); the filed follow-ups in `plans/wave-0/`. `pnpm verify` = docs-lint + typecheck + lint; `pnpm test` = the suites (Docker required).

**Three standing laws every session must know (all now RATIFIED and shipped — the earlier "not yet implemented" warnings are retired):**
1. **The ordering design is per-fold merge semantics (`26`, `DEC-PERF-001`).** `01-F34`: folds declare explicit merge rules and read **no ordering metadata** — no `global_seq`, no `lamport_seq`, **no device clock**, no envelope-id comparison that reaches a projected VALUE. Tested by bijective id-relabel + clock-injection invariance; plain convergence testing is insufficient (a min-id tiebreak passes it while smuggling wall clock in through the UUIDv7 prefix). `global_seq` = delivery cursor + compaction watermark only. `causal_seq` remains refuted; `lamport_seq` keeps its gap-free transport/audit role. **This is the law most often broken by accident** — twice in the post-review round, each time by a projected value quietly depending on id sort order or on the reading device's state.
2. **Time is branch-consensus and stamped at APPEND (`01-F43..F46`, `DEC-TIME-001`).** Durations need a *consistent* clock, not a correct one. `branch_created_at` + `time_basis` travel INSIDE the event, because a fold applying its own offset would break law 1 silently. `device_created_at` is an untrusted forensic hint with exactly one sanctioned reader (`01-N2` skew detection). Branch time is continuous across hub re-election — the hub serves the clock, it does not define it. Business day = Asia/Karachi, 05:00 cutover (layer-2 configurable).
3. **Money is integers-in-a-double, and the double is the hazard.** Integer paisas only; rates as integer basis points; `splitPaisa`/`applyRateBps` for division and rates (`DEC-MONEY-005`). Folds accumulate in **BigInt** — float `+` is non-associative near 2^53, so a running double total lets delivery order decide a money outcome (a live law-1 break, not a theoretical range concern). A total that cannot be represented exactly contributes **zero** and raises `money_overflow`; never truncate, never throw on the ingest path (`01-F17`). The GritQL ban covers bare identifiers **and** money-named member expressions incl. `as` casts — comparisons and plain assignment stay legal on purpose.

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
| Printing, pass screen, KDS, timing/ETA | `03` | `21`, `27` |
| Printed-document model (`DocumentSpec`/`DocumentProfile`, KOT + receipt layout) | `03` owns the renderer; `14` owns only the editing surface | `27`, `16` |
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
| Any UI/UX work (budgets, role laws, components) | `21` | `27` |
| Visual language: colour, type, numerals, icons, tokens | `27` | `21` |
| Backup/DR, retention, erasure, export | `22` | — |
| Fold performance, incremental maintenance, retroactive reordering | `25` | `01`, `19` |
| Fold merge semantics, convergence without a total order (**live design**) | `26` | `25`, `01` |
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
