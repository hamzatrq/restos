# @restos/sync-client

**Owning spec: `specs/01-kernel-sync.md` — read it before modifying anything here (AGENTS.md routing).**

- PROTECTED PATH. Device sync engine: outbox (the canonical durable-queue core, 18 §4), folds, LAN mesh, hub election.
- Folds are pure, commutative, idempotent (01-F34) — property tests mandatory (20 §2.3).
- **IMPLEMENTED (Wave 0).** See `README.md` for the module map (device store, merge fold engine, LAN mesh/hub, cloud session). PROTECTED path — senior review on every change.
