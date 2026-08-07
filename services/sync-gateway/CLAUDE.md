# @restos/sync-gateway

**Owning spec: `specs/01-kernel-sync.md` — read it before modifying anything here (AGENTS.md routing).**

- PROTECTED PATH (20 §4.4). The cloud end of the sync protocol; scales separately from api.
- **IMPLEMENTED (Wave 0).** See `README.md` for the module map (merge gateway, auth/registry, quarantine outbox, Auditor) and the six-table Postgres schema. PROTECTED path — senior review on every change; Postgres/Testcontainers to run.
- **THE `/internal` PUBLISH SURFACE (August 2026) — `publish-http.ts`.** The serving half of the
  founder ruling (`plans/wave-1/catalog-transport.md` §6 Q1): **the API publishes, the gateway
  serves.** `services/api` posts a versioned, immutable snapshot; this service stores it and answers
  device fetches. Four routes behind one bearer credential (`PUBLISH_TOKEN`, ≥32 bytes,
  `timingSafeEqual`): publish / read the published fold / append an org-scoped event / read the
  history. **`PUBLISH_TOKEN` absent is fail-CLOSED — every `/internal` route answers 503**, never
  "skip the check for local dev", which is how an unconfigured production gateway accepts a menu
  from anyone who can reach the port. It is NOT required at boot: a gateway with no back office
  beside it is a legitimate deployment, and crashing it would take the till's sync down to enforce a
  back-office concern. **This service still never parses menu structure** — entries pass through to
  `publishCatalog`, which is the only thing that judges them (`01-F60` completeness,
  `CatalogEntryWire`), and nothing in `publish-http.ts` knows what an item is.
- **`kernel.org_events` — `01-F62`'s ORG-SCOPED store (`org-events.ts`), a seventh table.** It is
  deliberately not `kernel.events` with a nullable branch: an org-scoped event carries `org_id` and
  **no `branch_id`, no branch stamp, no `device_id`, no `global_seq`, no `lamport_seq`**, and
  `01-F62` rejected the alternative that would have put a server value into `branch_created_at`.
  Ordering authority is `server_received_at` (`01-F18`); `seq` is an arrival tiebreak only, because
  a `14-F8` bulk edit writes several rows at one instant on purpose. `appendOrgEvent` refuses a type
  outside `01-F62`'s set — **including `audit.*`, the FR's own worked example**: `audit.login` is
  emitted by a *device* at a PIN unlock, so the admin family does not split cleanly and the EMITTER
  does. Append-only, like `kernel.events`.
