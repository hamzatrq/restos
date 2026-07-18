# 23 — AI Context Engineering: How Agents Consume This Documentation

**Engineering standards — Draft 1, July 2026** · Parent: `00-platform-overview.md`; governs `/AGENTS.md` (the router — `/CLAUDE.md` is Anthropic's official one-line `@AGENTS.md` bridge, giving Cursor/Copilot/Codex agents the same router) and the future monorepo's agent scaffolding. Companion to `18` (code rules) and `20` (correctness system). Research-reconciled (§9).

**The problem this solves:** the spec corpus is ~78k tokens across 24 documents. An AI session that loads everything degrades (context rot); one that loads nothing relevant invents policy (hallucination). Both failure modes are unacceptable for a system whose commandments guard money, legality, and data integrity. The corpus itself is already well-shaped — no doc exceeds ~4.7k tokens, and a typical task's working set is 2–4 docs (~10–15k tokens). What this document adds is the routing, enforcement, and hygiene that make correct loading the default rather than a hope.

## 1. The three-tier context architecture

| Tier | What | Budget | When loaded |
|---|---|---|---|
| **T0 — Router** | `/AGENTS.md`: commandments + routing table + working rules | ≤ ~1.5k tokens / ~120 lines, hard cap (official guidance: < 200 lines; instruction-adherence research shows threshold decay beginning around 100–150 simultaneous instructions with primacy bias toward the top — hence ~10 commandments, ordered by importance) | Always (every session) |
| **T1 — Working set** | The owning spec(s) for the task, per the routing table | ~10–15k tokens typical | At task start, by instruction |
| **T2 — Reference** | Master doc, decision records (19), research archives, other specs | On demand | Only when the task genuinely reaches into them |

- 23-F1 T0 stays under its cap forever. Anything that grows it beyond ~120 lines moves down a tier and leaves a pointer. The router explains *where truth lives*, never *what the truth is* — one-line commandment summaries carry their FR pointer; the FR text is the law.
- 23-F2 Nothing outside T0 is ever assumed loaded. Specs therefore repeat nothing from each other (authority order, `00` header) — a doc that must be read is *routed to*, not *summarized elsewhere* (summaries drift; pointers don't).
- 23-F3 Corpus shape law: no single spec exceeds ~4.5k tokens (~350 lines). A doc that outgrows this splits by ownership boundary, gets its own number, and joins the routing table + `00 §1` index in the same PR.

## 2. The dual-representation law for commandments

**A rule that exists only as prose an agent might not load is not a rule.** Every T0 commandment has two representations, and the mechanical one is authoritative:

| Commandment (CLAUDE.md #) | Mechanical enforcement |
|---|---|
| 1 Append-only | No update/delete API paths exist (01-F1); Auditor refold diff (20 §4.2) |
| 2 No invented events/states | Typed event registry — unknown type = compile error (01-F4); canonical-state enum in `domain` |
| 3 Integer money/quantities | Branded types; raw-number arithmetic banned (18 §4); property tests |
| 4 Offline-first / never block a sale | Chaos + simulation suites (20 §2.4–2.5); release gates |
| 5 Two-plane law | Dependency-direction lint: no TanStack Query import in operational apps' order paths; no direct SQLite in apps (18 §2, 21-lint) |
| 6 Closed UI vocabulary | Biome `noRestrictedImports` + arbitrary-value lint (21 §2) |
| 7 English UI / Unicode content | Inline-string lint + `strings.ts` convention (18 §7) |
| 8 Server-side authz | Generated permission-matrix tests, every role × action (20 §2.12) |
| 9 Spec-before-code | CI flags behavior-diff PRs with no spec-diff trail (20 §4.1); FR-ID-in-test-name convention |
| 10 Protected paths | CODEOWNERS (20 §4.4) |

- 23-F4 Adding a T0 commandment requires naming its enforcement mechanism in this table first. A rule that cannot be mechanically enforced or review-gated does not go in T0 — it goes in its owning spec and is caught by the acceptance-test layer.

## 3. Monorepo scaffolding (built at repo setup, `18 §2` layout)

- 23-F5 **Hierarchical + path-triggered memory (the mechanical answer to "right file loading"):** the root `AGENTS.md` is the router (T0). Every package/app gets a 5–15 line `CLAUDE.md` stub — **child-directory CLAUDE.md files load automatically when the agent reads files in that directory** (official behavior) — containing: what this package is, its owning spec path, and only the rules unique to that directory. Additionally, `.claude/rules/*.md` files with `paths:` glob frontmatter auto-attach per-area invariants (e.g. `paths: ["apps/pos-*/**"]` → "read `specs/02-pos-app.md` before modifying; states from 01 §4 only"). Loading the right context becomes a property of *touching the files*, not of the agent remembering to. Stubs and rules point at specs; they never duplicate them.
- 23-F6 **Hooks (deterministic, not advisory):** official position is explicit — memory files are context the model *may* ignore; hooks are the enforcement layer ("to block an action regardless of what Claude decides, use a PreToolUse hook"). Configuration ships in `.claude/settings.json`:
  - SessionStart: a script prints the routing rows relevant to the launch directory into context before the first prompt — deterministic routing injection.
  - PreToolUse on Edit/Write to protected paths (`packages/domain`, `sync-client`, `sync-protocol`, `escpos`, tax, auth): inject a reminder of the owning spec + the senior-review requirement (block requires explicit acknowledgment in session).
  - PostToolUse on any `.ts` edit: typecheck + Biome on the touched package — violations surface immediately inside the agent's own loop, where they are cheapest to fix.
  - PostToolUse on `specs/*.md` edits: the doc linter (23-F8).
- 23-F7 **Skills for procedures:** recurring multi-step procedures become repo skills (`.claude/skills/<name>/SKILL.md`) so their bodies load only when triggered (progressive disclosure — official authoring limits: body < 500 lines; description ≤ 1,024 chars, keyword-rich, since it is the routing signal; reference files one level deep): `add-event-type` (spec PR → domain schema → catalog → fold → tests), `add-dependency` (the 18 §15 process), `add-metric` (13 registry + golden test), `new-module-scaffold`, and a `spec-navigator` skill whose always-visible description covers locating the authoritative spec/FR for any module or rule ID. A procedure documented in a skill is removed from prose docs and pointed at.

## 4. Router integrity (the table must never rot)

- 23-F8 **CI doc linter** (runs on every spec/CLAUDE.md PR): every `specs/NN-*.md` file appears exactly once as an owner in the routing table and once in `00 §1`; every FR ID referenced anywhere resolves to a definition (`grep`-verified); FR IDs are unique corpus-wide; per-doc token count under the 23-F3 cap; the two authority-order blocks (`restaurant-os.md` / `00`) are byte-identical.
- 23-F9 Stable IDs are load-bearing for retrieval: FR IDs are never renumbered or deleted (superseded FRs get `~~strikethrough~~` + pointer, like `02` §9.4). Agents locate authority by grepping IDs; renumbering would sever every trail.
- 23-F10 Search is the fallback, not the path: when the routing table doesn't obviously cover a topic, agents search (`grep`/semantic search — hybrid search measurably beats grep-only on large corpora) rather than guess an owner — and a topic that needed searching twice earns a routing-table row.
- 23-F10a Staleness counter-measures beyond CI: router/spec edits are PR-reviewed like code; a Stop hook may propose router updates from session transcripts; telemetry on skills/rules that never fire flags dead weight for pruning (bloated always-on files reduce adherence — official prune test: "would removing this cause mistakes? If not, cut it").

## 5. Session discipline

- 23-F11 One module per implementation session; cross-module exploration goes to subagents (their context is disposable; the implementing session receives conclusions, not file dumps).
- 23-F12 Sessions start by loading the routed working set *before* writing code; an agent noticing it is reasoning about another module's behavior from memory must open that spec or delegate. Sessions stay short: measured compliance decays within a session (~5.6% lower adherence odds per additional generated function) — re-reading a spec section just before the edit beats having read it forty minutes ago.
- 23-F14 **Citation discipline (anti-hallucination):** any policy assertion in code comments, PR descriptions, or reviews must cite an FR ID; cited IDs are grep-verified (23-F8) — an invented rule fails mechanically because its ID resolves to nothing.
- 23-F13 The anti-hallucination protocol, verbatim in T0: **spec silent → STOP → `DECISIONS.md` → propose spec change.** Acceptance tests are written from spec text by a session other than the implementer (20 §4.3), which catches invented behavior even when the implementer missed the protocol.

## 6. What we deliberately do NOT do

- No always-loaded mega-context: the corpus is never concatenated into a session; nothing beyond T0 is "ambient." In particular, **`@import`-ing specs into the router is forbidden** — imports load at launch and would silently defeat the entire tier architecture.
- No prose duplication between docs "for convenience" — pointers only (drift is worse than a file-open).
- No reliance on the model remembering rules across sessions: every session re-derives its obligations from T0 + routed docs + mechanical gates.
- No vector-database dependency for core routing: the deterministic table + grep-able IDs are the primary path; semantic search assists discovery only.

## 7. Rollout

Live since Wave 0 scaffold (July 2026): `/AGENTS.md` router + `/CLAUDE.md` bridge; per-package CLAUDE.md stubs; `.claude/rules` path-triggered rules; PreToolUse (protected-path/oracle reminders — hard-deny on oracle paths activates with the first acceptance tests) + PostToolUse (biome per edit; docs-lint per spec edit) hooks; CI doc linter (`scripts/docs-lint.mjs`). Deferred: SessionStart routing injection (redundant until subdirectory launches are common), repo skills (arrive with the procedures they encode, 23-F7). Standing: router reviewed whenever a doc is added/split (23-F8 enforces).

## 8. Open questions

1. Hook strictness: hard-block protected-path edits vs inject-reminder — decide from field experience in Wave 0 (bias: reminder + CODEOWNERS; hard blocks frustrate legitimate flows).
2. Whether module docs gain 5-line "when to read me" front-matter descriptions consumable by tooling (skill-style progressive disclosure for specs).

## 9. Research reconciliation (completed July 2026)

The external research pass confirmed the architecture and produced the deltas now folded in above. Key evidence, for the record:
- **Official Anthropic guidance** matches the router model: CLAUDE.md < 200 lines, prunable, advisory-only ("context, not enforced configuration — use a PreToolUse hook to block"); hierarchical per-directory memory loads on file-touch; skills are the official home for procedures; subagents for exploration with ~1–2k-token reports. (code.claude.com/docs: memory, best-practices, large-codebases, hooks-guide; anthropic.com/engineering: effective-context-engineering, agent-skills.)
- **Context rot is real and non-linear** (Chroma 2025: reliability cliffs well below advertised windows; "lost in the middle" persists on 1M-token models). Instruction adherence: best models ~68% at 500 simultaneous instructions, threshold decay from ~100–150, primacy bias (IFScale, arXiv 2507.11538). Within-session decay ~5.6%/function (arXiv 2605.10039).
- **Context files are not free**: one 138-task study found repo-overview context files gained nothing and cost +20% (arXiv 2602.11988) while specific instructions were followed — supporting instruction-shaped routers over prose overviews; a second study found AGENTS.md cut runtime 28.6% (arXiv 2601.20404). Evidence is contested; our CI-checked router + on-demand specs sits in the untested-but-best-aligned region.
- **Ecosystem convergence**: Cursor's four rule types (always / auto-attached / agent-requested / manual) map one-to-one onto our T0 / path-rules / skills / reference tiers; AGENTS.md is a Linux-Foundation cross-tool standard (Cursor, Copilot, Codex et al.) — hence the AGENTS.md-canonical + CLAUDE.md-bridge layout, which matters here because this project's audits already run through Cursor agents.
- **Spec-driven development literature** (GitHub Spec Kit's constitution, AWS Kiro's steering files, Fowler-site critique) lands on the same split we use — permanent laws + per-task spec injection — and its main warning (spec volume doesn't buy adherence; *verification* does) is doc 20's thesis.
- **Gaps we knowingly occupy**: no controlled study validates stable FR IDs for agent adherence (they are, however, what makes adherence *checkable*), no published number for safe always-on rule counts, and no benchmark for invented-policy hallucination — our grep-verifiable citation discipline (23-F14) is the strongest available proxy.
