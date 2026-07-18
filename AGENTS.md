# RestOS — Agent Guide

Restaurant OS for Pakistani restaurants. TypeScript monorepo (planned per `specs/18`), offline-first, event-sourced. **The specs are the contract: never code or edit from memory of a spec — open the owning doc first, per the routing table below.** Full context rules: `specs/23-ai-context.md`.

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
| Cross-cutting open/undecided questions | `DECISIONS.md` | — |
| This file's governance, agent context rules | `23` | — |

Cross-cutting laws (offline, performance, security, language, config layers): `00 §5–§7`. Doc conflicts: authority order in `00` header. Find an FR by grepping its ID (`grep -rn "02-F9" specs/`); unsure which doc owns a topic → search, don't guess.

## Working rules

- One module per session; load only the routed docs (a task needs ~2–4 specs, not the corpus).
- Editing a spec: follow the template in `00 §8`; new FRs continue the doc's numbering; never renumber or delete existing IDs.
- New event types / states / config keys: spec PR to the owning doc **and** `01 §4` / `00 §7` first, code second.
- Anything here that seems to conflict with a spec: the spec wins — and flag the drift so this file gets fixed.
