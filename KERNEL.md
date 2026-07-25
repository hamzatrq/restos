# RestOS Kernel — reviewer's map

**Audience:** the engineer reviewing the Wave-0 kernel. This is the entry point — read it first, then the per-package READMEs in the order below. It orients you to *what the kernel is, how the pieces fit, and where to look*; the specs are the authority for *why*.

Everything here is on branch `feat/t-01-16-transport` (not yet merged to `main`). Nothing else in `packages/`/`services/` is built — this is the kernel only, the foundation the product apps (specs 02–17) will sit on.

---

## 1. What the kernel is, in one screen

RestOS is an **offline-first, event-sourced** restaurant OS for Pakistani restaurants. The deployment reality that drives every design choice: a branch has 3–6 cheap Android tablets + a Windows counter; internet is unreliable and often given only to the counter; **a whole day offline is normal**; and **a sale must never be blocked** — not by sync, not by a server being unreachable.

The kernel is the machinery that makes that work:

- **Every action is an immutable event** appended to a per-device log (`order.created`, `payment.recorded`, …). The log is **append-only** — nothing is mutated or deleted; corrections are new linked events. In a cash business the ledger *is* the audit trail.
- **Each device folds its event log into materialized views** it renders (open orders, kitchen queue, table state).
- **Devices gossip events over the LAN**; one is an elected **hub**. When internet exists, events also reach a **cloud gateway** that merges across branches and fans the merged log back.

### The one idea a reviewer must internalise

Early design assumed folds need a **single total order** everyone agrees on, arbitrated by a cloud-assigned sequence (`global_seq`). That produced a **measured O(N²) re-fold** and let sync metadata decide business outcomes. It was replaced (task **T-01-15**) by **merge semantics**: each fold field declares its own commutative/monotonic merge rule, and **device folds read no ordering metadata at all** — no `global_seq`, no clock, no device-id order. `global_seq` survives only as a **delivery cursor**. Convergence is proven by *bijective id-relabel + sequence/clock injection invariance*, not by replay — because plain replay would bless a min-id tiebreak that smuggles the wall clock back in. If you read one design doc, read **`specs/26-merge-semantics.md`**; the full story (measured defect → refuted alternatives → the chosen design) is `specs/25-fold-performance.md`.

---

## 2. The two planes

The system is split by a hard law (`18 §6`): **operational (device) plane** vs **cloud plane**. They never mix silently.

```
   DEVICE PLANE (offline-first)                        CLOUD PLANE
   ────────────────────────────                        ───────────
   packages/domain        ← shared vocabulary, imported by everything →
   packages/sync-protocol ← shared wire contract, both planes encode/decode →

   packages/sync-client            push / catch-up (WS)      services/sync-gateway
   ├─ device-store (SQLite)  ───────────────────────────▶   ├─ gateway (merge, Postgres)
   ├─ merge fold engine                                     ├─ auth + device registry
   ├─ LAN mesh + elected hub  ◀── relay for WAN-less ──▶    ├─ quarantine + notice outbox
   └─ cloud session                                         └─ Auditor (nightly, read-only)

   packages/testing  ← deterministic sim harness (virtual LAN + virtual cloud) for tests →
```

- The **hub** relays WAN-less devices' events to the cloud on their behalf (`DEC-SYNC-009`) — the normal deployment gives internet only to the counter, so without this a waiter tablet's events would reach the counter over LAN but never reach the cloud.
- The **cloud** assigns `global_seq` (delivery order, *not* business order), merges into an append-only Postgres ledger, and the **Auditor** re-checks the whole thing nightly.

---

## 3. Reading order

Read the package READMEs in this order — each builds on the last:

| # | Read | Why here | Lines |
|---|---|---|---|
| 1 | **`packages/domain/README.md`** | The shared vocabulary — events, money types, state machine, invariants. Everything imports it. | ~205 |
| 2 | **`packages/sync-protocol/README.md`** | The wire contract both planes speak. Short. | ~180 |
| 3 | **`packages/sync-client/README.md`** | The device engine — the merge fold engine lives here. The hardest and most important package. Start with its "mental model" primer. | ~300 |
| 4 | **`services/sync-gateway/README.md`** | The cloud plane — merge, auth, quarantine, and the Auditor. | ~290 |
| 5 | **`packages/testing/README.md`** | The sim harness the tests run on. Read last — it explains *how* the above is verified, and the "double-drift" risk to scrutinise. | ~130 |

Design docs referenced by the READMEs (read on demand, not front-to-back):
- `specs/26-merge-semantics.md` — the ordering design (authoritative). `specs/25-fold-performance.md` — how it was reached.
- `packages/sync-protocol/PROTOCOL.md` — the human-readable wire protocol.
- `packages/sync-client/HUB-ELECTION.md` — hub election + relay + split-brain tolerance.
- ⚠️ `packages/sync-client/FOLDS.md` is a **stale pre-implementation artifact** (banner at its top). Do not read it as the shipped design — the README + spec 26 supersede it.

---

## 4. What was built, and how it was verified

Eight kernel tasks, each through the same loop — **acceptance tests written first by a separate session (the "oracle"), then implementation, then an independent adversarial review, then a fix round**. The tests are the contract; "done" means the named check passes, never the author's judgment (`24 §3`).

| Task | What it delivered |
|---|---|
| **T-01-15** | The merge-semantics fold engine (replaced the O(N²) comparator) |
| **T-01-12** | Hub-relayed cloud uplink for WAN-less devices (the launch blocker) |
| **T-01-13** | Money helpers (`splitPaisa`/`applyRateBps`) + a lint ban on raw money arithmetic |
| **T-01-08** | The quarantine pipeline + durable notice outbox |
| **T-01-09** | Device auth (JWT), registry, revocation, origin-existence checks |
| **T-01-11** | The Auditor — five read-only correctness legs, run nightly |
| **T-01-16** | Batched catch-up persistence + the zstd wire codec *(codec present + fixture-tested; **not yet wired into live transport** — the plain JSON codec is still used on the socket. Compression is a filed follow-up, so the 60s/4G budget's compression half is not in the shipped path yet.)* |

**Current state:** `pnpm verify` green (docs-lint + typecheck + lint); `pnpm verify:01` = **34 green / 0 red / 13 unmapped of 47 FRs**; full suites green — domain 98, sync-protocol 32, sync-client 264, testing 49, gateway 151 (on real Postgres via Testcontainers). `pnpm test` needs Docker.

**The adversarial reviews earned their cost:** five of the eight review passes found a *blocking, durable-data-loss* defect that the green test suite could not see — a relay slot-displacement, a heal-boundary split-brain, a revoked-origin livelock, an audit-suppression primitive, and a wedge introduced by a planner ruling. Every one was invisible to the tests and fatal in production. The per-task trail (rulings, findings, fixes) is in **`plans/wave-0/t-01-*-fix-round.md`** — worth reading alongside each package.

---

## 5. Open items the reviewer should weigh (not defects — decisions & deferrals)

- **Founder decisions — now ratified (July 2026), implementation scheduled:** `DEC-TIME-001` accepted and promoted into `01-F43..F46` (branch-consensus time on the hub; absolute stamps provisional-until-reconciled; `device_created_at` demoted to an untrusted hint; Asia/Karachi day boundary) — until **T-01-17** lands, `confirmed_at`/`kot_at`/`age_basis` still stamp from an untrusted clock, so treat those values as unreliable when reviewing. `DEC-AUTH-001`/`DEC-AUTH-002` accepted (`01-F47`/`01-F48`: 90-day token expiry with silent hub-relayed renewal, `iss`/`aud` binding, 30 s fail-closed revocation eviction) — **T-01-18**. `DEC-SYNC-010` (per-connection compression negotiation) — **T-01-19**. `DEC-SYNC-011` (blocked catch-up cursor is observable; stop-and-report, never skip) — **T-01-20**. The four product constants in `packages/domain/src/product-constants.ts` are ratified at their matrix defaults and are no longer open.
- **Filed follow-ups (MED/LOW, non-blocking)** in the `t-01-*-fix-round.md` files: e.g. the Auditor leg-5 null-envelope guard, the heal→notice reconciliation, live zstd framing wiring.
- **Not yet done at all:** physical wall-clock proof on a real 2 GB tablet (p95, plug-pull — deferred to the hardware rig, `D3`); the H-01 test-harness rungs. The kernel is verified in logic and simulation; it has never run on target hardware.
- **Governance:** every task touches protected paths (`domain`, `sync-client`, `sync-gateway`); CODEOWNERS senior review is mandatory before merge. That review is what this document is for.
- **Residual trust assumption (DEC-SYNC-009, accepted):** a compromised *relay-authorized hub* can fabricate events attributed to any registered branch peer — the gateway's origin gate checks the origin's *existence*, not *authorship*; Wave 0 has no per-event origin signatures. Accepted for the branch-hub topology; stated here so it is visible.
