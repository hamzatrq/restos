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
3. Review is mandatory before the change is done — and as of August 2026 that lane is an **adversarial review in a separate agent context**, not a human senior (founder ruling; `20 §4.4` is the single declaration). Give the reviewer the FR IDs and the diff and **not** your reasoning for believing it correct: the rationale that produced a blind spot is the frame that hides it. A verdict of SHIP that names nothing it checked is not a review.
4. `packages/domain` specifically: schemas are declared once here; redeclaring a domain type elsewhere is a violation, not a convenience.
