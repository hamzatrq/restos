---
paths:
  - "specs/**"
  - "AGENTS.md"
  - "restaurant-os.md"
---

# Editing the documentation corpus (23-F8, 00 §8)

- Follow the module template in `specs/00` §8. New FRs continue the doc's numbering; **never renumber or delete an existing ID** (supersede with strikethrough + pointer).
- Adding/splitting a doc = same-PR updates to the AGENTS.md routing table and the 00 §1 index.
- The authority-order block exists in `restaurant-os.md` and `specs/00` and must stay byte-identical.
- Run `pnpm docs:lint` before finishing — the PostToolUse hook runs it on every spec edit and will feed failures back.
- Cross-cutting decisions that lack one owning doc go to `specs/DECISIONS.md`, not into whichever file is open.
