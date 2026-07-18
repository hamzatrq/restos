# @restos/sync-client

**Owning spec: `specs/01-kernel-sync.md` — read it before modifying anything here (AGENTS.md routing).**

- PROTECTED PATH. Device sync engine: outbox (the canonical durable-queue core, 18 §4), folds, LAN mesh, hub election.
- Folds are pure, commutative, idempotent (01-F34) — property tests mandatory (20 §2.3).
- This package is a scaffold stub: no implementation exists until its plans/ task and pre-implementation artifacts (24-F8) do.
