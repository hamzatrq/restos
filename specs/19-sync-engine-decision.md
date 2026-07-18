# 19 — Sync Engine: Build vs Buy (Decision Record)

**Decision record — July 2026** · Parent: `00-platform-overview.md`; refines `01-kernel-sync.md` §8. Research basis: product documentation, pricing pages, and release notes verified July 2026 (sources §8). **Decision: build a custom sync engine. Confirmed with evidence, not preference — the product category we'd want to buy from does not exist.**

## 1. The question

Should the kernel's sync layer (01 §3) be built on an existing engine — PowerSync, ElectricSQL/Electric, Replicache/Zero, Turso, Ditto, or CRDT libraries — or built custom?

## 2. Requirements recap

| # | Requirement | Source |
|---|---|---|
| R1 | SQLite on every device; RN/Expo (op-sqlite) + Electron (better-sqlite3); TypeScript | 18 §4 |
| R2 | Fully offline indefinitely | 00 §5.1 |
| R3 | **Branch LAN sync device↔device with WAN down, sub-second** | 01-F12..15 — make-or-break |
| R4 | Append-only event log; conflicts rare by design; no general CRDT merging needed | 01 §3 |
| R5 | Postgres system of record; self-hosted; no per-device SaaS economics | 00 §3 |
| R6 | We control wire format & storage (hash-chained audit; auditable sync) | 01-F5, 20 §4.2 |
| R7 | Scoped sync slices per device class (waiter/rider) | 01 §9.2-resolved |

## 3. Candidates — verdicts (verified July 2026)

| Product | R3 LAN mesh? | One-line verdict |
|---|---|---|
| **PowerSync** | **No** — explicitly hub-and-spoke; no P2P by stated design philosophy | Best hub-and-spoke fit otherwise (op-sqlite official integration, own-backend write path, self-hostable FSL service; Node SDK still beta) — but cannot do the one thing we can't compromise on |
| **Electric** | **No** — read-path streaming from central Postgres; write path is DIY; no device↔device | Apache-2.0 and honest scope, but offline devices can't see each other's writes; 2026 rebrand toward AI-agent infra is strategic-drift risk |
| **Zero (Rocicorp)** | **No** — and **no on R2**: offline writes were explicitly disabled in Q4 2025 ("reads work, writes rejected") | Disqualified twice over for a POS |
| **Turso Sync** | **No** — device↔Turso-cloud only; and SQLite-native platform displaces Postgres (R5 conflict) | Impressive CDC sync (GA Apr 2026) in the wrong topology; RN support unverified |
| **Ditto** | **Yes** — genuine multi-transport mesh (mDNS/LAN, BLE, P2P Wi-Fi); proven in our vertical (Chick-fil-A cloud-optional POS); Electron/Windows ↔ RN/Android LAN mesh officially supported | The only credible "buy" — but proprietary black-box CRDT store (breaks R6), self-managed server is enterprise-tier (R5), indefinite-offline requires negotiated offline-license tokens (R2 caveat), contact-sales pricing across thousands of cheap devices (per-device economics unverified) |
| **Yjs / Automerge** | Building blocks, not engines | Solve concurrent-document merging — a problem an append-only log doesn't have; Automerge RN support still incomplete |
| **LiveStore** (2025-26 entrant) | **No** — central sync backend, git-style pull-before-push | Closest *conceptual* match (event-sourcing → materialized client SQLite, Apache-2.0, first-class Expo/Node) — a reference codebase, not a dependency |

## 4. Analysis

**4.1 The category insight.** Every mainstream "local-first sync engine" means *client ↔ central service with offline tolerance*. Our defining requirement is *devices syncing with each other when the center is unreachable* — a different, tiny category (Ditto; Couchbase Mobile). We were not choosing among ten options; we were choosing between Ditto and building.

**4.2 Industry validation of our design.** Toast — the closest large-scale analog to our product — documents exactly the architecture we specified in 01-F13: a designated **local hub device on the restaurant network relaying orders between terminals regardless of WAN state**. Chick-fil-A chose the true-mesh route via Ditto. Square's offline story is only a time-boxed payments queue. Our hub-election design is the Toast pattern, independently arrived at; the spike is validating a field-proven topology, not a novel one.

**4.3 Why not Ditto, despite R3.** (a) R6 is structural: an opaque CRDT document store means our hash-chained ledger rides inside a wire/storage format we can't audit — and the append-only ledger's auditability is the platform's spine (20 §3). (b) R2 is contractual, not technical: offline-forever requires negotiated shared-key license tokens; a POS whose legal ability to run offline depends on token terms is a risk we don't need. (c) R5/pricing: self-managed server is enterprise-tier; per-device cloud-connection economics are contact-sales. (d) Their Edge Server (the in-store hub product aimed at exactly our scenario) is explicitly not production-ready. Ditto remains the documented **exit ramp** (§6), and is a genuinely good product for teams whose data model isn't an auditable ledger.

**4.4 Why not the hybrid (PowerSync for WAN leg + custom LAN relay).** Superficially attractive; loses on inspection. We must build the LAN layer ourselves regardless — that is the hard part. The WAN leg for an append-only log (push own events in order, pull merged stream from a sequence cursor — 01-F8/F9) is the *easy* part. The hybrid would replace the easy part with: a second sync model (row/bucket sync vs event streams — an impedance mismatch with fold-based devices), a beta Node SDK on our most critical device (the Electron hub), an FSL-licensed service to operate, and two protocols to chaos-test instead of one. Buying only makes sense when it removes the hard problem; here it removes the easy one and doubles the surface.

**4.5 Why building is smaller than it sounds.** "Build a sync engine" usually implies merge algebra, conflict resolution, and convergence proofs. An append-only event log with per-device lamport ordering eliminates the merge algebra: set-union of events + deterministic folds + the closed conflict list of 01-F16..20. What remains is discovery (mDNS), transport (WebSocket), hub election, cursors/checkpoints, and idempotent delivery — engineering, not research — with correctness enforced by the deterministic-simulation harness (20 §2.4) rather than by trusting a vendor.

## 5. Decision & what we borrow

**Build custom** (`packages/sync-client`, `sync-protocol`, `services/sync-gateway`), per 01 §3. Borrowed with attribution:
- **PowerSync:** the write-checkpoint concept (client advances only after server-persistence ack) → our 01-F8 ack watermark; their op-sqlite integration code as reference for RN storage-adapter ergonomics.
- **Toast:** the branch-hub relay topology (validates 01-F13; their docs are the pattern precedent).
- **LiveStore (Apache-2.0):** reference reading for eventlog→SQLite materialization and reactive query design — read the code, take the ideas, take no dependency.
- **Electric:** the discipline of a read path that is plain, cacheable, resumable HTTP/WS — our catch-up range fetch (01-F9) stays this boring on purpose.

## 6. Exit ramps & tripwires

1. **Spike failure ramp:** if the Wave 0 spike misses its exit criteria (01 §8) after two focused iterations, run a 2-week Ditto evaluation build of the same spike scenario — with a negotiation checklist: offline-license token terms (indefinite?), pure-P2P device billing, Edge Server GA timeline, data-export guarantees, and an events-as-insert-only-documents modeling test preserving our hash chain *inside* payloads.
2. **Second opinion on ramp:** Couchbase Mobile (P2P-capable, hospitality-proven) — evaluate only if Ditto negotiation fails; RN bindings are community-grade (unverified) so it starts a step behind.
3. **Watch-items (review at each wave boundary):** Ditto Edge Server reaching GA (improves their fit); Electric's agent-platform pivot (dependency-risk lesson: we cite them as reference only); Turso CDC sync gaining RN + self-host (could matter for a future read-replica story, not for R3).

## 7. Consequences accepted

Owning the protocol means owning its testing burden — that is what 20 §2.4 (deterministic simulation), §2.7 (contract/cross-version tests), and the seed corpus exist for; they are not optional extras but the price of this decision, priced in deliberately. It also means the protocol is a permanent senior-review path (18 §2 sacred packages, 20 §4.4 CODEOWNERS).

## 8. Sources (verified July 2026)

PowerSync: docs.powersync.com (architecture, philosophy/no-P2P, self-hosting, writing-client-changes), powersync.com/pricing, releases.powersync.com (Node beta, op-sqlite) · Electric: electric.ax/docs/guides/writes, github.com/electric-sql/electric, electric-sql.com/blog (Cloud pricing Apr 2026; TanStack DB 0.6 Mar 2026) · Zero: zero.rocicorp.dev/docs/offline + /roadmap + /react-native, infoq.com Zero 1.0 (Jun 2026) · Turso: turso.tech/blog/sync-benchmark (Apr 2026), docs.turso.tech · Ditto: docs.ditto.live (RN install, Node.js compatibility, edge-server, shared-key auth), ditto.com/pricing, qsrmagazine.com Chick-fil-A/Ditto · Toast: doc.toasttab.com offline-mode/local-sync · LiveStore: github.com/livestorejs/livestore, docs.livestore.dev · Yjs/Automerge: github.com/yjs/yjs, y-op-sqlite, automerge.org/blog/automerge-3.
