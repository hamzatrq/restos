# 25 — Fold Performance: Retroactive Reordering and the O(N²) Re-fold

**Decision record — Draft 1, July 2026** · Parent: `00-platform-overview.md`. Owns the analysis behind how device folds (`01-F6`, `01-F34`) are maintained as the cloud assigns ordering. Written after a measured defect on the live cloud-sync path; **the structural decision in §9 is still open.**

---

## 1. The question

A device folds its event log into materialized views (open orders, kitchen queue). Events are appended locally in a *provisional* order, then the cloud assigns an org-wide `global_seq` on merge and fans them back — which can move an event's position in canonical order. Adopting that sequence currently forces a **full re-fold of the entire log**.

Is there a design that keeps folds correct under retroactive reordering *without* quadratic cost on a 2 GB tablet?

## 2. The defect — precise mechanism

Canonical order is the tuple `(global_seq ?? +∞, device_created_at, device_id, lamport_seq)`. The incremental fold engine (T-01-04b) has one fast path: apply in place **iff** the new event's canonical key is ≥ the highest key already applied. Anything else falls back to `rebuild()`.

Assigning a `global_seq` moves an event **out of the `+∞` tail and earlier** into the finite range. It therefore *always* misses the fast path. The fallback, `recomputeFolds()`, is `engine.rebuild(readAllInputs())` — it re-reads every stored event, re-parses each through Zod, re-sorts, and re-folds from scratch.

Two call sites trigger it: duplicate-id ingest carrying a `global_seq`, and `assignGlobalSeq`. Because cloud fan-out is **origin-inclusive** (a device's own events come back stamped), essentially **every event a device ever appends triggers one full rebuild**.

> Cost per adopted event: **O(N)**. Cost across N events: **O(N²)** — on the ordinary cloud-sync path that runs continuously in production, not in a synthetic test.

## 3. Measured evidence

Method: `openStore(":memory:")`, append N `order.created` events, then call `assignGlobalSeq` once per event (simulating origin-inclusive fan-out), timing only the adoption loop. Apple-silicon laptop, in-memory SQLite — i.e. **the most favourable possible conditions**.

| Ledger size (N) | Total adoption | Per event |
|---|---|---|
| 200 | 173 ms | 0.86 ms |
| 400 | 618 ms | 1.55 ms |
| 800 | 2,510 ms | 3.14 ms |
| 1,600 | 10,573 ms | **6.61 ms** |

Per-event cost doubles as N doubles; total quadruples. Textbook quadratic, confirmed rather than inferred.

**Extrapolation.** A busy day ≈ 500 orders × ~10 events ≈ **5,000 events** → ~20 ms/event → **~100 s of pure CPU** just adopting sequence numbers. The rolling operational window (`01-N3`) is "current business day + configurable N days", so realistic N is **10,000+** → ~40 ms/event → **~7 minutes of CPU**. Target hardware is a 2 GB Android tablet, plausibly **5–10× slower** than the measurement rig.

> ⚠️ An earlier note in the wave-0 plan claimed ~57 s for the X8 scenario and a coverage-gate timeout. **Both readings were contaminated by concurrent load** and have been corrected: re-measured on a quiet machine the file runs ~23–24 s and the coverage gate passes. The quadratic above is the real finding; that timing was not.

## 4. Why this is launch-blocking, not debt

- **Compute cost** scales quadratically with ledger size — directly the operational-cost concern.
- **Battery and thermals** on a tablet doing tens of minutes of avoidable CPU per day.
- **UI stutter during rush**, exactly when the system must not hesitate (`00 §5.3` budgets).
- It degrades **as a restaurant gets busier and as the day goes on** — the worst possible failure shape, invisible in a pilot and painful at scale.

## 5. What external research established

A verified-source research pass (106 agents; sources: VLDB/OSDI/PODS/SIGMOD primaries plus author-written technical posts) returned a mostly **negative** result, which is itself valuable:

- **The mature IVM delta model is not our answer.** DBSP, differential dataflow, Materialize and Feldera encode change as retract-at-old + insert-at-new, and the model *is* portable to an embedded single-node engine. But it is **order-agnostic by construction**: it maintains multiset *membership*, not *position in a total order*. It does not natively address "this event's sequence number moved."
- **Noria** — the one production system in the set that reasons explicitly about ordering — treats order preservation along a dataflow path as a correctness *requirement*, with **no repositioning mechanism**.
- **DBSP's authors footnote the degenerate case, and it is ours:** when a small input change perturbs every output row, incremental evaluation collapses to full-query cost. N such retroactive insertions still aggregate to O(N²). *The theory corroborates the problem rather than dissolving it.*
- **Useful residue.** Retract/insert is unavoidably stateful and needs a per-key index of current values — **O(live keys), independent of log length** — and that index can be **the SQLite materialized-view table itself**, not a second structure. And the *q-hierarchical dichotomy* proves **query shape, not hardware**, decides whether O(1) maintenance is achievable — encouraging, because our fold shape is simple.

**Conclusion carried from the research:** do **not** adopt a general IVM engine. Either confine order-sensitivity so recomputation is scoped, or **eliminate the reordering premise entirely**.

## 6. Limits of that research (read before relying on it)

- **Scope gap — the big one.** Only IVM (and partially partition-scoped recompute) produced surviving claims. **Nothing survived on CRDT register designs, snapshotting/checkpointing, or HLC/stable total orders** — which the report itself calls *"precisely the areas most likely to contain the practical answer."* Absence of findings there is **not** evidence they are dead ends.
- **High refutation rate.** 16 of 25 candidate claims were voted down, including the optimistic readings — notably *"a retroactive reorder can be encoded as a single retract+insert delta, no replay required"* was **refuted**.
- **No performance numbers survived.** There is **zero verified quantitative basis** in that pass for sizing any technique against a 2 GB tablet.
- **Extrapolation warning.** Every source is order-agnostic; applying them to "`global_seq` changed" is analogy, not corollary.
- **Cost.** That pass consumed ~4.2M tokens. A second pass should be narrowly targeted at the three uncovered areas, not repeated broadly.

## 7. Options

| # | Option | Effect | Effort / risk | Spec impact |
|---|---|---|---|---|
| **A** | **Skip no-op adoptions** — cloud order usually *matches* provisional order, so the rebuild changes nothing. Detect and skip. | Removes most rebuilds outright | Low / low | none |
| **B** | **Entity-scoped recompute** — rebuild only the affected order (~5–50 events), not the whole ledger. The engine already has per-order projections. | O(N²) → O(N·k) | Low-med / low | none |
| **C** | **Batch per catch-up page** — one rebuild per page instead of one per event. | Large win on catch-up specifically | Low / low | none |
| **D** | **Keyed LWW/FWW registers** — store the deciding canonical key beside each order-sensitive field (`table_id`, `confirmed_at`). Adoption becomes an O(1) key comparison; no replay ever. | Structurally removes replay | Medium / medium | fold contract |
| **E** | **Stable order at append (HLC)** — fix canonical order at creation time with a hybrid logical clock that is never revised; `global_seq` becomes a *delivery/catch-up cursor*, not the ordering authority. **The reorder never happens, so the fast path always applies.** | **Deletes the problem class** | High / high | `01-F34` tiebreak, `01-F18` LWW-by-`server_received_at` |
| **F** | **Snapshots/checkpoints** — periodic fold snapshots so replay starts from the last snapshot. | Bounds cold-start replay only | Medium / low | none |
| **G** | ~~General IVM engine (DBSP/Materialize)~~ | **Not recommended** — see §5 | — | — |

**On (E).** This is what the research points at without having covered it. Devices already agree on a deterministic provisional order; an HLC makes that order *permanent* and *causally sound*, so no device ever has to re-decide. Cost: `01-N2` already declares device clocks untrusted (skew > 5 min raises a health flag but never blocks) — an HLC bounds skew's effect via causality tracking, but ordering would no longer be arbitrated by a trusted central clock. That is a genuine architectural trade, not a refactor.

## 8. Recommendation

**Phase 1 — measurable, low-risk, no spec change:** implement **A + B + C** and re-run the §3 benchmark. Expectation: quadratic → roughly linear. The existing refold-equivalence property test is the correctness oracle, so the mechanism swap is gated by tests already written.

**Phase 2 — structural, needs a decision:** choose between **D** (keyed registers) and **E** (stable append-time order). D is contained and incremental; E is deeper, riskier, and potentially removes the problem permanently. Decide on evidence from Phase 1 plus a focused design analysis — *not* another broad research sweep.

Phase 1 does not foreclose either Phase 2 path.

## 9. Open decisions (founder)

1. **Does the cloud remain the ordering authority?** Keeping cloud-assigned `global_seq` authoritative (status quo, + option D) vs moving to a stable append-time order (option E). This is the load-bearing call — it changes `01-F34`'s tiebreak and `01-F18`'s LWW-by-`server_received_at`.
2. **Is a second, narrow research pass warranted** on the three uncovered areas (CRDT registers, snapshotting, HLC vs central sequencer) before deciding (1)?

## 10. Tripwires

- Any fold change must keep the **refold-equivalence** property green — incremental state must equal a clean canonical replay, always. That property is the guard for every option here.
- Re-run the §3 benchmark after each phase; a regression in the per-event curve is a release blocker, not a note.
- Do not benchmark on a loaded machine (see the §3 warning).

## 11. Sources

Research pass (July 2026), verified claims only: McSherry et al., *Shared Arrangements* (PVLDB 13(10)); Budiu et al., *DBSP* (VLDB 2025); Battiston/Kathuria/Boncz, *OpenIVM* (SIGMOD 2024); Gjengset et al., *Noria* (OSDI 2018). Refuted/unverified material is deliberately excluded — see §6.
