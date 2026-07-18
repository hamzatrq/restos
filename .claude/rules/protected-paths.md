---
paths:
  - "packages/domain/**"
  - "packages/sync-client/**"
  - "packages/sync-protocol/**"
  - "packages/escpos/**"
  - "services/tax/**"
  - "services/sync-gateway/**"
---

# Protected path (20 §4.4)

You are touching a protected package. Before any edit:
1. Open the owning spec (this directory's `CLAUDE.md` names it) — never work from memory of it.
2. Behavior changes cite a resolving FR ID; no FR = spec PR first (commandment 9).
3. Senior review is mandatory on the PR (CODEOWNERS enforces).
4. `packages/domain` specifically: schemas are declared once here; redeclaring a domain type elsewhere is a violation, not a convenience.
