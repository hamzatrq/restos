# 25 — Fold Performance: Retroactive Reordering and the O(N²) Re-fold

**Decision record — Draft 1, July 2026** · Parent: `00-platform-overview.md`. Owns the analysis behind how device folds (`01-F6`, `01-F34`) are maintained as the cloud assigns ordering. Written after a measured defect on the live cloud-sync path. **§18 is the live position; §8/§9/§13 are superseded.**

> ## ⚠️ STATUS: NO ORDERING DESIGN IS SELECTED — read §18 first
>
> §18 (the live position) reframes the problem: deterministic folds need **deterministic merge semantics, not a universal total order**. §8/§9 are superseded, §13 is refuted, and the D-vs-E framing was itself the wrong question. The refutations of §13 below still stand and are why it must not be implemented.
>
> A 74-scenario adversarial review (`plans/wave-0/fold-scenario-catalog.md`) found **multiple P0 refutations** of the clock-free causal order recommended in §13. Do not implement against §13. In particular:
>
> - **§13 claim 3 (causality) is provably false under partial observation.** A Lamport clock bumps only on what it *observes*; a waiter on a hub-enforced `01-F40` slice sees ~15 % of branch traffic, so its clock is **structurally and permanently deflated** — it loses races because it is *permitted to see less*, not because it acted later. Worse for the rider (`09-F2`), which never joins the branch LAN. The claim silently assumed total observation (catalog **F60**).
> - **§12's argument for rejecting HLC rebounds on §13.** `causal_seq` is unbounded, unverifiable and forgeable: one peer event carrying `MAX_SAFE_INTEGER` makes the mandatory `max+1` unrepresentable, `append` throws, **the till stops mid-service** — and `01-F1` forbids deleting the poison, which then fans out branch-wide. That is the HLC poisoning hazard **inherited in a harsher form** (HLC drags the clock forward but keeps working) (catalog **F62**).
> - **§16's O(N) budget rests on option B being O(k≈10). It is not.** There is **no `CREATE INDEX` anywhere in `packages/sync-client`** and `order_id` exists only inside JSON text, so scoping one entity costs a full scan + parse: O(N). The rush-event half of F65 — *"branch-global, so there is no entity to scope to"* — is **itself now corrected** (see §17's correction and §18): those events are branch-wide for *delivery* but **row-keyed for projection** (`item_id`, `table_id`, `shift_id` per `FOLDS.md`). The index-cost half of F65 stands.
> - **The migration has no sound backfill.** Rank-in-my-set is not subset-independent, so devices holding legitimately different subsets stamp *different* `causal_seq` on the same immutable event — breaking the very property §13 relies on, permanently, since `causal_seq` is never revised (catalog **F103-class**).
> - **§13 does not fix as much as claimed.** Window replay sorts by `(device_id, lamport_seq)`, so origin-block boundaries step the key backwards and the miss count is **essentially unchanged** (catalog **F34**); park-and-drain is **identical** under both keys (**F22**); concurrent-append ties are unchanged (**F19/F20**).
> - **§13 makes residency strictly worse.** `rebuild()` assigns fresh accumulator Maps and is currently **the only thing that ever resets them** — removing rebuilds removes the accidental garbage collector (**F07**).
> - **The evidence base is incomplete.** No ablation exists for what options A+B+C alone buy (**F69**), the benchmark N counted only order events while `readAllInputs()` parses *every* row (**F71**), and the "bounded by the delivery window" claim was never measured against the real transport (**F70**). *"Quadratic, therefore migrate" without "here is what three lines buys" is not a sufficient basis for a one-way-door decision.*
>
> **Now also refuted by the §17 ablation:** option A alone is worthless when cloud order genuinely differs and inert on the skew profile. **A+B+C solves the offline-skew profile (O(1) per append) but leaves the cloud-reordering profile quadratic**, 2–4× over budget on target hardware. Option B is *incorrect* as naively conceived — its entity index is itself order-dependent. **So neither path is clean: the cheap fixes do not close it, and the structural alternative in §13 carries the P0 refutations above.** That is the real decision state.

---

## 1. The question

A device folds its event log into materialized views (open orders, kitchen queue). Events are appended locally in a *provisional* order, then the cloud assigns an org-wide `global_seq` on merge and fans them back — which can move an event's position in canonical order. Adopting that sequence currently forces a **full re-fold of the entire log**.

Is there a design that keeps folds correct under retroactive reordering *without* quadratic cost on a 2 GB tablet?

## 2. The defect — precise mechanism

Canonical order is the tuple `(global_seq ?? +∞, device_created_at, device_id, lamport_seq)`. The incremental fold engine (T-01-04b) has one fast path: apply in place **iff** the new event's canonical key is ≥ the highest key already applied. Anything else falls back to `rebuild()`.

Assigning a `global_seq` moves an event **out of the `+∞` tail and earlier** into the finite range. It therefore *always* misses the fast path. The fallback, `recomputeFolds()`, is `engine.rebuild(readAllInputs())` — it re-reads every stored event, re-parses each through Zod, re-sorts, and re-folds from scratch.

**Three call sites trigger it**, not two:

1. **`assignGlobalSeq`** — and this one never consults the fast path at all. `assignGlobalSeqTx` is `if (adoptGlobalSeq(...)) recomputeFolds()`, and `adoptGlobalSeq` returns true on *any* newly-inserted sidecar row, so `engine.apply()` and the `maxKey` comparison are never reached. **The rebuild is unconditional.** Because cloud fan-out is **origin-inclusive**, essentially every event a device appends triggers one full rebuild.
2. **Duplicate-id ingest** carrying a `global_seq`.
3. **`applyFold` on the ordinary `append`/`ingest` path** — whenever an arriving event sorts below the current tail. **This reaches O(N²) with no cloud, no `global_seq` and no WAN at all** (measured, §3 B2). A device whose clock is merely *behind* stamps every local append below the peer events already in the unsequenced tail, so every one of its appends rebuilds the whole ledger. Skew magnitude is irrelevant — the guard is a comparison, not a threshold, so **a few minutes of skew triggers it as reliably as ten years**. `01-N2` explicitly tolerates skew (health flag, "never blocks operation"), which makes this an *accepted operating state* that silently makes every local append O(N).

> Cost per adopted event: **O(N)**. Cost across N events: **O(N²)** — on the ordinary cloud-sync path **and**, independently, on a purely offline device with a skewed clock.

## 3. Measured evidence

Method: `openStore({ path: ":memory:", identity })` — *not* `openStore(":memory:")`; append N `order.created` events, then call `assignGlobalSeq` once per event (simulating origin-inclusive fan-out), timing only the adoption loop. Apple-silicon laptop, in-memory SQLite, load average 1.4–2.9 — i.e. **the most favourable possible conditions**.

### B1 — offline-day reconnection storm (the T5 worst case)

| Ledger size (N) | Total adoption | Per event |
|---|---|---|
| 100 | 55 ms | 0.55 ms |
| 200 | 155 ms | 0.78 ms |
| 500 | 1,012 ms | 2.02 ms |
| 1,000 | 4,032 ms | 4.03 ms |
| 2,000 | 17,497 ms | 8.75 ms |
| **10,000** | **548,111 ms (9 min 8 s)** | **54.81 ms** |

Appends themselves stay flat (~0.02 ms/event) — the fast path works. **All the cost is adoption.**

Fitted exponent between consecutive points: 1.99 → 2.12 → **2.14**. Quadratic, drifting *super*-quadratic at scale (GC pressure re-parsing a 10 k-envelope ledger). A pure-quadratic extrapolation from N=2,000 predicted 437 s; actual was 548 s — **25 % worse than quadratic**, so the earlier extrapolations in this section were conservative, not alarmist.

> **All 10,000 rebuilds in this run were provable no-ops.** The assigned order was identical to the provisional order, so every rebuild produced byte-identical fold state — and ran anyway. This is direct evidence for §7 option A, and it reclassifies A: the no-op check is *absent by construction*, not mistuned. It is a ~3-line guard.

### B2 — skewed clock, fully offline (no `global_seq` assigned at all)

Interleaved peer ingest (stamps ≈ now) with local appends stamped 10 years in the past; control arm stamps 1 ms *after* the peer's.

| N | control ms/append | **skew ms/append** | ratio |
|---|---|---|---|
| 250 | 0.028 | 0.985 | 35× |
| 500 | 0.015 | 2.001 | 133× |
| 1,000 | 0.014 | **3.896** | **289×** |

Control is flat O(1) (cost *decreases* with N — JIT warmup). Skew doubles as N doubles: quadratic. Peer ingest stays cheap in both arms — **only the skewed device's own appends rebuild**, exactly as the §2 mechanism predicts. Hypothesis **confirmed**.

**Extrapolation to target hardware.** The measured 548 s for T5 is on an Apple-silicon laptop; a 2 GB Android tablet is plausibly **5–10× slower** → **45–90 minutes**. Against the §11 budget of 60 s, that is **~2 orders of magnitude over**.

**Caveats — both benchmarks are lower bounds.** Every event is a dependency-free `order.created`, so nothing ever parks; a realistic ledger with `order.confirmed` / `line_added` chains adds parked-list drain cost on top. The fast-path guard is `>= maxKey` over applied **∪ parked** (ties pass), slightly wider than "highest applied". B2 measured only the 10-year variant — skew magnitude and interleave ratio were not swept.

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
| **A** | **Skip no-op adoptions.** ~~Alone takes the 548 s reconnect storm to near-zero.~~ **REFUTED by the §17 ablation.** A is near-perfect only when cloud order *matches* provisional order — the artifact of the original fixture. When cloud order genuinely differs it is **worthless** (2,297 → 2,292 rebuilds), and on the skew profile it is **completely inert** (identical to arm 0 to the millisecond). | Only on the matching-order case | Low / low, but low value alone | none |
| **B** | **Entity-scoped recompute** — rebuild only the affected order (~5–50 events), not the whole ledger. The engine already has per-order projections. | O(N²) → O(N·k) | Low-med / low | none |
| **C** | **Batch per catch-up page** — one rebuild per page instead of one per event. | Large win on catch-up specifically | Low / low | none |
| **D** | **Keyed LWW/FWW registers** — store the deciding canonical key beside each order-sensitive field (`table_id`, `confirmed_at`). Adoption becomes an O(1) key comparison; no replay ever. | Structurally removes replay | Medium / medium | fold contract |
| **E** | **Stable order at append (HLC)** — fix canonical order at creation time with a hybrid logical clock that is never revised; `global_seq` becomes a *delivery/catch-up cursor*, not the ordering authority. **The reorder never happens, so the fast path always applies.** | **Deletes the problem class** | High / high | `01-F34` tiebreak, `01-F18` LWW-by-`server_received_at` |
| **F** | **Snapshots/checkpoints** — periodic fold snapshots so replay starts from the last snapshot. | Bounds cold-start replay only | Medium / low | none |
| **G** | ~~General IVM engine (DBSP/Materialize)~~ | **Not recommended** — see §5 | — | — |

**On (E).** This is what the research points at without having covered it. Devices already agree on a deterministic provisional order; an HLC makes that order *permanent* and *causally sound*, so no device ever has to re-decide. Cost: `01-N2` already declares device clocks untrusted (skew > 5 min raises a health flag but never blocks) — an HLC bounds skew's effect via causality tracking, but ordering would no longer be arbitrated by a trusted central clock.

> ⚠️ **§7(E) is superseded by §11–§16.** Under the founder's stated clock threat model (every device may be arbitrarily wrong, in either direction), **HLC is the wrong instrument** — it inherits a physical-time term it cannot defend. The recommendation is now a *clock-free* causal order (§13). The framing of E's cost above is also too generous to the status quo: see §12.

## 8. Recommendation

> ⚠️ **SUPERSEDED — §8 and §9 below are the July-2026 state and are retained for history only.** They recommend A+B+C then a D-vs-E choice, and §9 asserts the causal order as answering the open question. **Both are withdrawn**: §17 measured A+B+C failing the cloud-reordering profile, the STATUS banner records the P0 refutations of the causal order, and §18 reframes the problem such that the D-vs-E framing is itself the wrong question. **No ordering design is currently selected.** Read §18 for the live state.

**Phase 1 — measurable, low-risk, no spec change:** implement **A + B + C** and re-run the §3 benchmark. Expectation: quadratic → roughly linear. The existing refold-equivalence property test is the correctness oracle, so the mechanism swap is gated by tests already written.

**Phase 2 — structural, needs a decision:** choose between **D** (keyed registers) and **E** (stable append-time order). D is contained and incremental; E is deeper, riskier, and potentially removes the problem permanently. Decide on evidence from Phase 1 plus a focused design analysis — *not* another broad research sweep.

Phase 1 does not foreclose either Phase 2 path.

## 9. Open decisions (founder)

1. **Does the cloud remain the ordering authority?** Keeping cloud-assigned `global_seq` authoritative (status quo, + option D) vs moving to a stable append-time order. **§11–§16 answer this: no.** Under the founder's clock threat model the recommendation is a clock-free causal order (`causal_seq`, `device_id`) with `global_seq` demoted to a delivery cursor. `01-F34`'s tiebreak is rewritten; `01-F18` is **unaffected** (cloud-plane, server time trustworthy). Awaiting founder ratification — tracked as `DEC-PERF-001`.
2. **The time layer** (§14) — branch-consensus time anchored on the hub, provisional-until-reconciled absolute stamps, `01-N2` un-deferred. Separable from (1) and needed under **any** ordering choice. Tracked as `DEC-TIME-001`.
3. **Is a second, narrow research pass warranted** on the remaining uncovered areas (CRDT registers, snapshotting)? §11–§16 close the HLC/stable-order question on first-principles grounds, so that third area no longer needs a pass.

## 10. Tripwires

- Any fold change must keep the **refold-equivalence** property green — incremental state must equal a clean canonical replay, always. That property is the guard for every option here.
- Re-run the §3 benchmark after each phase; a regression in the per-event curve is a release blocker, not a note.
- Do not benchmark on a loaded machine (see the §3 warning).

## 11. Clock threat model (founder-stated, July 2026)

The ordering design must hold under **all** of the following simultaneously:

- **T1** A device's clock may be wrong by *years*, in **either** direction (10 years behind; 3 years ahead).
- **T2** Wrongness is not a smooth offset — a device may read `1 Jun 2029 00:00` while true time is `21 Jul 2026 18:43`. Arbitrary, not skew.
- **T3** **Every** device in a branch may be wrong, simultaneously and differently. There is no "majority of good clocks" to appeal to.
- **T4** The cloud runs in a different timezone from the restaurant.
- **T5** The branch may be fully offline for a whole business day — **~1,000 orders ≈ 10,000 events** with no `global_seq` assigned to any of them.

**Budget:** folding the T5 worst case must complete in **< 60 s** on a 2 GB tablet.

> ⚠️ **Target definition (added later, see §18).** The *contracted* figure in `00 §5` is **~500 orders after 8 h offline, < 60 s on 4G — end-to-end, transfer included**. The 10,000-event figure below is **branch-wide full-day stress**, and every measurement in this document is **fold CPU only**. Both distinctions matter when quoting these numbers.

**On T4 — timezone is a non-issue for ordering, by existing rule.** `18 §4` already mandates epoch-millisecond integers in events and storage, with timezone applied only at UI edges. Epoch ms denotes an absolute instant; a device in Karachi and a cloud in another region reading the same instant produce the same integer. Mobile OSes store UTC internally, so a *misconfigured timezone* does not corrupt epoch ms — only a wrong clock does, which is T1–T3. Timezone survives as a real concern in exactly one place: the **business-day boundary** (day-close, "today's sales", the `01-N3` rolling window) must be anchored to Asia/Karachi regardless of cloud region. That is a reporting-correctness matter, tracked in §14, not an ordering matter.

## 12. The three candidate orders under that model

| | **Status quo** — cloud `global_seq`, `device_created_at` tiebreak | **HLC** | **Pure causal (Lamport)** |
|---|---|---|---|
| Device 10 y **behind** | **Breaks.** Sorts to the front of the unsequenced tail forever; the raw clock is re-read every event, so it never heals | Self-heals: `l` jumps forward on first contact and is persisted | **Immune** |
| Device 3 y **ahead** | **Breaks** | **Poisons the org.** `l = max(...)` is monotone, so a fast clock drags every device to 2029 and it can never come back | **Immune** |
| **All** devices wrong (T3) | **Breaks** | **Breaks** — max of wrong values is still wrong; there is no good clock to heal against | **Immune** |
| Arbitrary wrongness (T2) | Breaks | Breaks | **Immune** |
| Timezone (T4) | non-issue (epoch ms) | non-issue | non-issue |
| Order **stable**? | **No** — revised on cloud ack. This is the O(N²) source | Yes | Yes |
| Offline day, 10 k events (T5) | **Reconnection storm** — see §16 | Fine | Fine |
| Requires cloud to order? | **Yes** | No | No |
| Order carries wall-clock meaning | Approximate, via cloud arrival | Approximate, via device clocks | **None** — by design |

**The status-quo column is worse than §7 implied.** `global_seq` is trusted and is key #1 — but every event spends time in the unsequenced tail, and folds run *continuously* against that tail using `device_created_at` — a raw, untrusted, never-healing clock read — as the deciding key (`packages/sync-client/src/folds/replay.ts:121`). The trusted-order property therefore holds only **retroactively**. We are paying quadratic cost to retroactively repair an order that untrusted clocks got wrong in the first place.

**HLC fails T3 specifically.** HLC's guarantee is "tracks physical time *provided* some clock is roughly right." T3 removes that premise. What remains is a monotone counter plus an unbounded poisoning hazard from the fastest clock in the fleet — strictly worse than a counter with no physical term at all.

## 13. Recommendation — clock-free causal order

Order events by

> **`key(e) = (causal_seq, device_id)`**

where `causal_seq` is a **true Lamport clock**: `causal_seq = max(all causal_seq observed) + 1`, bumped on local append **and on receipt of any peer or cloud event**, persisted with the event, never revised.

**Why this is correct rather than merely better.** Four properties, each provable and none dependent on a clock:

1. **Total order.** `causal_seq` strictly increases per device, so it is unique within a device; `device_id` is unique across devices. The pair therefore has no ties — a total order on any event set, with no third term needed.
2. **Convergence.** The key is a pure function of the event's own immutable fields. Every device sorting the same set produces the same sequence, with no coordination and no authority. (`01-N1` holds by construction.)
3. **Causality.** By Lamport's theorem, if A happened-before B then `causal_seq(A) < causal_seq(B)`. Bumping on receive is what carries causality *across* devices — this is exactly what today's per-device counter does not do.
4. **Clock-independence.** There is **no physical-time term in the key.** A device 10 years off, 3 years ahead, or reading a hand-typed 2029 is bit-for-bit as correct as one with perfect NTP. T1–T3 are not mitigated — they are rendered structurally incapable of affecting order.

**Why it dissolves the performance problem.** A locally appended event's `causal_seq` is by definition greater than every key that device has observed — so it is always ≥ the highest applied key, and **always hits the incremental fast path**. `global_seq` no longer participates in ordering, so adoption stops triggering rebuilds. The offline day (T5) never sequences anything at all, so the reconnection storm has nothing to storm about.

The only residual out-of-order insert is **LAN delivery reordering** — a peer event arriving after a concurrent event that sorts above it. That is bounded by the delivery window, *not* by ledger size, and combined with entity-scoped recompute (§7 option B) costs O(k) where k ≈ events-per-order ≈ 10. Total work for T5 is O(N) with a small constant. See §16.

**`causal_seq` must be a NEW envelope field — it cannot reuse `lamport_seq`.** `01-F3` requires `lamport_seq` to be per-device **gap-free**, and the gateway's per-origin contiguity tracking, the push watermark/ack (`01-F8`), the outbox-never-wedges rule (`DEC-SYNC-005`) and the Auditor's gap check all depend on that. A causal clock *jumps* on receive and is therefore inherently gappy. The two roles are mutually exclusive; both are needed, side by side.

## 14. The time layer — separate from the ordering layer

The original design error was conflating "what order did these happen in" with "what time did they happen at." §13 answers the first and deliberately answers *nothing* about the second. The second needs its own mechanism:

- **Durations need a consistent clock, not a correct one.** Kitchen age and ETA (doc 03) are *differences* — `now − kot_at` — and a uniform offset cancels in a difference. So a branch whose clocks all agree is sufficient for every duration in the product, even if that shared time is collectively wrong.
- **Branch-consensus time.** The elected hub (`01-F13`) is the branch time authority; devices carry an offset to hub time and stamp durations in it. This composes with `DEC-SYNC-009`: the hub is *also* the branch's WAN uplink, so in the common deployment the hub is the device that has internet — hence real NTP time. **Branch time is therefore genuinely correct in the normal case and merely self-consistent in the fully-offline case**, which is exactly the guarantee each case needs.
- **Absolute business timestamps** — tax and fiscal instants (doc 16), audit chronology (`01-F5`), the day boundary — use `server_received_at` when available, and are stamped in branch time and **marked provisional** when offline, reconciled at contact. `16-N3` already anticipates precisely this ("skew > 5 min is flagged (01-N2) and `server_received_at` is stored alongside for reconciliation").
- **`device_created_at` is demoted** to an untrusted display/forensic hint. It leaves the ordering key entirely.
- **Live defect to fix regardless of this decision:** `replay.ts:247,256` set `confirmed_at` and `kot_at` from raw `env.device_created_at`, so a wrong clock writes wrong values straight into timing read models that doc 03 consumes. No ordering scheme repairs this — it is a time-layer bug.
- **`01-N2` is specced but unimplemented** (no skew detection exists in `packages/` or `services/`) and is deferred out of Wave 0 (`conformance/wave-0-scope.yml:75`). That deferral should be revisited: it is the detection half of this layer.
- **Day boundary** anchored to Asia/Karachi irrespective of cloud region (T4).

## 15. Blast radius

| Change | Impact |
|---|---|
| New `causal_seq` envelope field, bumped on append **and receive** | `01-F3` amendment; envelope schema; append + ingest paths |
| Ordering key → `(causal_seq, device_id)` | `replay.ts:117-123`; `01-F34` tiebreak rewritten |
| `global_seq` demoted to **delivery/catch-up cursor** + cloud storage order | Retains its transport role; loses its ordering role |
| `lamport_seq` | **Unchanged** — keeps its gap-free transport/audit role |
| `device_created_at` | Removed from ordering key; retained as untrusted hint |
| `01-F18` catalog/price LWW by `server_received_at` | **Unchanged.** Catalog editing is a cloud-plane back-office action (`14-F6`) where server time *is* trustworthy and there is no offline requirement — the two-plane law (`18 §6`) lets the planes order by different rules. This is a materially narrower blast radius than §7(E) claimed |

**Timing.** Wave 0 has no production data and no migration to write. This change is close to free now and expensive after the first pilot ships — which is itself an argument for deciding it now rather than after Phase 1.

## 16. Worst-case budget (T5: 10,000 offline events)

**Status quo — measured, not projected.** The offline day accumulates 10,000 unsequenced events; on reconnect the cloud sequences all of them and each adoption rebuilds unconditionally. §3 B1 measures **548 s (9 min 8 s) on a laptop**, → **≈ 45–90 min on a 2 GB tablet**. Against the §11 budget of 60 s: **~2 orders of magnitude over**.

And that is only the reconnect path. §3 B2 shows a **fully offline** device with a skewed clock hits the same quadratic on ordinary appends — 289× slower per append at N=1,000, with no cloud involved. A branch can therefore blow the budget *without ever getting internet at all*, which is precisely the T5 scenario.

**Proposed.** 10,000 fast-path applications plus a bounded number of entity-scoped recomputes at O(k≈10) — O(N) with a small constant, projected **well under one second**.

**Why the causal order closes both paths.** Adoption stops reordering (site 1 and 2 disappear). For site 3, a local append's `causal_seq` is by construction the maximum the device has seen, so it can never sort below the tail — **the skew pathology is not mitigated, it is unreachable**. What remains at site 3 is peer events arriving out of order, bounded by the delivery window rather than by ledger size, and handled at O(k) by entity-scoped recompute.

> The status-quo figures are **measured** (§3). The proposed figure is a **projection** — it requires the §8 Phase-1 work to exist before it can be measured, and must not be quoted as measured until §3 carries it.

## 17. The F69 ablation — measured, July 2026

Four cumulative arms (0 / A / A+B / A+B+C) × profiles × N, file-backed SQLite with the shipped pragmas, realistic dependent chains, integer counters primary. Prototype preserved in the worktree `.claude/worktrees/agent-a126162be98be18de` (uncommitted).

| profile | N | arm 0 | +A | +A+B | +A+B+C |
|---|---|---|---|---|---|
| P1 cloud order **matches** | 10,000 | 614.07 s | 1.01 s | 0.59 s | 0.06 s |
| P1 cloud order **differs** | 10,000 | ≈7,970 s *(extrap.)* | — | 1,061 s | **25.81 s** |
| P2 skewed offline appends | 10,000 | 123.60 s | 123.25 s | **1.35 s** | **1.34 s** |

**The decision-relevant integer — P2 under A+B+C: O(1) per append.** Exactly one scoped rebuild per skewed append; `scoped_rows_read / rebuild` = **3.50 at every N**; zero full rebuilds; total work growth **2.0 per doubling (linear)** vs 4.0 for arms 0 and A. **The offline-skew profile is solved by the cheap fixes.**

**Verdict: A+B+C does NOT close the problem.** P1-differ stays **quadratic in every arm** (growth ratio ≈4.0 per doubling, including ABC at 4.00/4.00). A+B+C divides the constant by ~191× but does not change the curve. At N=10,000 it is 25.8 s on the measurement laptop — inside 60 s, but only **2.3× margin**, and §3 puts target hardware at 5–10× slower: **129–258 s, a 2–4× breach.**

**Cause of the residual: entity-less events.** Under A+B the leftover full rebuilds equal the entity-less event count *exactly*. Under A+B+C a single entity-less event in a page collapses that page's scope to a full rebuild. Today's instance (`audit.*`) is fold-inert and therefore skippable.

> ### ❌ CORRECTION — the generalisation from that measurement was WRONG
>
> This section originally concluded that *"real branch-global events are fold-consuming, so for those the full rebuild is not removable"*, and that conclusion drove the "neither path is clean" verdict. **It is false.** An external review checked `packages/sync-client/FOLDS.md` and found the supposedly entity-less events are all **row-keyed for projection**:
>
> | fold | state table | key |
> |---|---|---|
> | `availability` | `availability(item_id PK, …)` | `item_id` |
> | `table_state` | `tables(table_id PK, …)` | `table_id` |
> | `shift_cash` | `shifts(shift_id PK, …)` | `shift_id` |
>
> **Sync scope and fold scope were conflated.** These events are branch-wide for *delivery* and row-scoped for *projection* — exactly the property scoped recompute needs. The measurement itself was sound: `audit.*` genuinely is entity-less and fold-inert, and that is what was measured. The error was **extrapolating from the stand-in to the real types** — which the ablation could not test only because they still have no payload schema in `domain`.
>
> Consequence: **the residual that made A+B+C fail the cloud-reordering profile is probably not structural.** The correct abstraction is not an *entity* index but a **projection-key** index — an event maps to the set of keys it affects (`order:O1`, `item:I4`, `table:T2`, `shift:S8`). The missing payload schemas must be designed *before* these event families are used to argue that scoped maintenance is impossible.

**Option B is incorrect as naively conceived, not merely slow.** Two genuine correctness failures surfaced and were fixed during the ablation, *both of which would have shipped green-on-performance and red-on-correctness*: a parked-table PK violation, and an intermittent `01-F6`/`01-N1` divergence in **30–50 % of runs** where refunds arriving before their payment were never indexed and scoped replay silently omitted them. Further, a correct index needs **two tables and a back-fill write path** (`event_entity` + `pending_refund`), because `payment.refunded` names a payment *event id* whose entity is knowable only through an event that may not have arrived yet. **The entity index is itself order-dependent — the same retroactive-reordering pathology, one level down.** Un-indexed full-scan B was also measured: still quadratic, and it does not linearise P2 at all.

**Two of this document's own assumptions were refuted.**
- **`:memory:` did not materially flatter the earlier numbers** — file-backed costs only **1.5–14 %** more. The workload is CPU-bound on Zod parsing and fold replay, not on WAL/fsync.
- **Integer counters UNDERSTATE the harm.** The realistic fixture reaches **peak parked ≈ 2,038 (~18 % of the ledger)** where the old fixture parked *nothing*; `drain()` is O(parked²), so A+B/P1-differ/N=10,000 took **1,061 s against a 168 s parse-count extrapolation**. Wall clock degrades faster than any counter predicts.

**Blocking gap found:** `availability.changed`, `shift.*`, `day.*`, `cash.drawer_opened`, `table.state_changed`, `printer.status_changed` are in the `01 §4` catalog but have **no payload schema in `packages/domain`** — `parseEvent` throws `UnknownEventTypeError` for all of them. Only 8 fold-consumed + 5 `audit.*` types exist. The branch-global stream — the case that decides the residual above — **cannot currently be measured at all**, and the ablation substituted `audit.*` as a fold-inert stand-in.

**Correctness:** 152/152 on every arm, 12/12 repeated property-stress runs per arm, 18/18 on an added per-profile refold-equivalence gate across 6 arms × 3 N × 4 profiles.

**Caveats.** The fixture contains no `payment.refunded`, so the `pending_refund` back-fill cost is exercised for correctness but **not timed**. The `parseEvent` counter excludes `readAllInputs`' own parsing. Load average was 2.4–6.0 on some rows; the N=10,000 runs and the full correctness sweep ran at 1.7–2.3.

## 18. The reframing — merge semantics, not a universal order (live state)

An external review (July 2026) argued this document has been solving the wrong problem, and the argument holds. **This section supersedes §8, §9 and §13 as the live position.**

### The framing error

`§1` and the external problem statement both assert that deterministic folds require a **total order**. **They do not.** They require *deterministic merge semantics*: operations that are commutative, state that is monotonic, or concurrency that is represented explicitly rather than silently arbitrated. `01-F34` already gestures at this ("every fold is commutative and idempotent") — the universal comparator in `replay.ts:117` then quietly does the opposite, arbitrating *everything* through one order.

### The consequence we had not named

**Sync metadata currently decides business outcomes.** Cloud receipt order is an artifact of *who reconnected first*. Today it determines which table assignment wins (`replay.ts:260`), which confirm/KOT timestamp anchors (`:242`, and from an untrusted device clock), and potentially which of two competing state transitions applies (`:287`). Cloud arrival order is a legitimate **delivery cursor**; it is not a reliable expression of staff intent, and it should never have been load-bearing for either.

That reframing dissolves the §9 question. "Cloud authority vs stable append-time order" is a choice between two ways of arbitrating a global order — when the fix is for most projections not to need one.

### The model

Roles become narrow and non-overlapping:

| field | sole role |
|---|---|
| `global_seq` | cloud delivery / catch-up cursor. **Zero fold work on adoption.** |
| `lamport_seq` | gap-free per-origin transport + audit counter |
| `device_created_at` | forensic hint. Not order, not business time |

Plus a **projection-key sidecar**: the domain registry deterministically returns every key an event affects (`order:O1`, `item:I4`, `table:T2`, `shift:S8`), indexed in SQLite and derived from validated payloads. This is the generalisation of §17's entity index — and per §17's correction, the real branch-global events *are* row-keyed, so they fit it.

Then each fold declares its own merge rule instead of inheriting the comparator:

| data | merge rule |
|---|---|
| lines keyed by `line_id` | map/set union |
| payments & refunds | unique attempt/event map, then sum |
| confirmed / printed facts | monotonic boolean or set |
| table assignment, availability | multi-value register, or a product-defined concurrent policy |
| line workflow | predecessor-linked transition DAG; concurrent heads surface as a visible conflict |
| timing | the separate branch/server time layer (`DEC-TIME-001`) |

### Two concrete defects this exposes

1. **`payment.refunded` should carry `order_id` directly**, alongside `payment_id`, validated against the parent when it arrives. Verified: `payment.recorded` *has* `order_id`; `payment.refunded` has only `payment_id` (`registry.ts:53`). That asymmetry is the entire source of the late-resolving-entity trap that made the naive index diverge in 30–50 % of runs (§17). **A one-field schema addition removes the recursive problem** that a two-table back-filled index was being designed to work around. No production data exists, so it is free now.
2. **The parked-list drain is an independent quadratic.** `replay.ts:333` re-attempts the whole parked list on every applied event. Indexing parked events by `waiting_for` and retrying only those waiting on the newly-arrived reference removes it. §17 measured this biting hard: one arm took 1,061 s against a 168 s counter-based prediction because `drain()` is O(parked²).

### Prior art

Monotonic / semilattice operations converge without delivery ordering (CALM; Conway et al., *Logic and Lattices for Distributed Programming*, Bloom^L). Non-commutative operations can use a **partially ordered** operation log rather than a total one (*Pure Operation-Based CRDTs*, arXiv:1710.04469). Multi-value registers can retain concurrent values while presenting a deterministic default (Automerge conflict model). **Borrow the patterns; do not adopt a general CRDT framework** — the machinery is not the hard part, the restaurant-specific merge semantics are.

### Completing the path — what the ordering fix does NOT cover

A second external review (July 2026) accepted the §18 direction and then pointed out that it is **necessary but not sufficient** for the headline target. Verified against the code:

**1. The budget is END-TO-END, and every measurement in this document is CPU-only.** `00 §5` reads *"sync catch-up after 8h offline with ~500 orders **< 60 s on 4G**"* — the 60 s includes **network transfer**. §3, §17 and every figure here measure fold CPU in isolation. A perfect fold fix therefore does **not** demonstrate the budget is met.

**2. Target definition.** The contracted figure is **~500 orders after 8 h offline**. The **10,000-event** figure used throughout §11–§17 is *branch-wide full-day stress* — legitimate as a safety target (an order genuinely produces ~8–15 events across create/lines/confirm/kitchen/print/pay, so 1,000 orders exceeds 10,000 events), but it is **not** the contract and must be labelled as such wherever it is quoted. Note also that 10,000 is a **branch** total: `01-F39`/`01-F14` mean counter, kitchen and manager retain the full stream and may hold all of it, while waiter and rider hold scoped slices and hold far less.

**3. Why §18 nonetheless dissolves the headline case.** On the normal outage — **WAN down, LAN healthy** — every device has already folded those events incrementally as they arrived over the LAN. Reconnect is then *purely* the cloud attaching delivery metadata to events the device already has. Under the current code that harmless acknowledgement of 10,000 already-known events is what detonates into quadratic replay (`device-store.ts` adoption path). With `global_seq` as a zero-fold-work delivery cursor, that cost **goes to nothing** rather than merely getting smaller. This is the single strongest argument for the §18 direction.

**4. Two transport-layer bottlenecks that remain, both verified:**

- **Cloud catch-up persists one event per transaction.** `cloud-session.ts:116` calls `store.ingest()` **per event**, while the LAN path uses `store.ingestBatch()` (`mesh-session.ts:260,353`). With `synchronous = FULL` (`device-store.ts:196`) that is **one fsync per event** — 10,000 fsyncs for a full catch-up. Each ~500-event page should persist and project in one transaction.
  > ⚠️ **Do not naively wrap the loop in a transaction.** The per-event structure is load-bearing: the pull cursor advances only through a *contiguous prefix of events that actually landed*, and a `DivergentDuplicateError` must be **passed** rather than wedge the pull (`01-F9`/`01-F34`/`01-F17`). Both behaviours were previous convergence-hole fixes. Batching must preserve per-event failure granularity — or it re-opens a bug that has already been fixed once.
- **zstd batch compression is specced but not implemented.** `01 §5` states *"JSON + zstd batch compression is sufficient at this event volume"*; `grep` finds no compression anywhere in `packages/` or `services/`. On 4G this is part of the 60 s, not an optimisation.

**5. Acceptance scenarios** (these, not a single number, are what "solved" means):

| scenario | expected device work |
|---|---|
| WAN down, LAN healthy | events already folded; reconnect = upload + dedupe + sequence adoption, **zero refolding** |
| full-stream device wholly offline | download and project all events **exactly once**, in transactional pages |
| waiter / rider reconnects | download **only its authorised slice** (`01-F40`) |
| crash mid-catch-up | resume from the committed page cursor **without repeating completed projection work** |

**Do not claim the target is met** until the complete path — compressed 4G transfer, batched SQLite persistence, zero-work sequence adoption, incremental projection — passes on the reference 2–3 GB Android tablet.

### Status

**No ordering design is selected.** `DEC-PERF-001` remains open, `causal_seq` is not to be implemented, and **T-01-14 is paused** — not because its work is wasted (the projection-key sidecar is needed under every candidate) but because it was scoped to an *entity* index and a back-filled workaround for a trap that a one-field schema fix removes.

Next: a merge-semantics matrix for the eight implemented events plus availability/table/shift/cash — *affected keys · dependencies · merge algebra · concurrent UX · time source* — then prototype only the three hard cases (payment/refund totals, concurrent table assignment, competing line-state transitions). **The acceptance oracle changes shape too:** fold-specific convergence, not equality to one universal canonical replay.

## 19. Sources

Research pass (July 2026), verified claims only: McSherry et al., *Shared Arrangements* (PVLDB 13(10)); Budiu et al., *DBSP* (VLDB 2025); Battiston/Kathuria/Boncz, *OpenIVM* (SIGMOD 2024); Gjengset et al., *Noria* (OSDI 2018). Refuted/unverified material is deliberately excluded — see §6.
