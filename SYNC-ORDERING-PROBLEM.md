# An unsolved ordering problem in an offline-first event-sourced POS

**A request for outside opinion.** Self-contained — no knowledge of our codebase or specs required. July 2026.

---

## 0. What I'm asking for

We have a design bottleneck we've measured, attacked twice, and not solved. I'd like an outside read before we commit to a one-way-door decision.

**Useful feedback:**
- "There's a known technique for this you've missed" — with a name or a paper.
- "Your framing of the problem is wrong, here's why."
- "Approach X is salvageable if you do Y" (see §6 for what we rejected and why).
- "This constraint you're treating as fixed is actually negotiable."
- "You're solving the wrong layer."

**Not needed:** general event-sourcing advice, or "just use Kafka" (§7 explains why that doesn't apply).

You do **not** need to read any code. Everything required is below. Numbers in §4 and §5 are measured on real code, not estimated.

---

## 1. What the product is

A restaurant operating system for Pakistani restaurants — point of sale, kitchen display, waiter tablets, inventory, the lot. The deployment reality that drives every design decision:

- A branch has **3–6 devices**: a counter terminal, one or two waiter tablets, a kitchen screen, sometimes a manager's phone.
- **Internet is unreliable and often deliberately absent.** The common setup gives internet to the counter terminal *only* — partly cost, partly the owner not wanting waiters on the internet. So waiter and kitchen devices are LAN-only **by design**, not by accident.
- **A whole business day offline is normal**, not an edge case. Load-shedding, a dead router, an unpaid bill.
- Target hardware is a **2 GB Android tablet**, roughly 5–10× slower than the laptop our benchmarks run on.
- **A sale must never be blocked.** Not by sync, not by validation, not by a server being unreachable. This is absolute.

## 2. The feature we're building

An **offline-first synchronisation kernel**. Every device keeps working with no internet and no server, and devices reconcile into one consistent picture when they can talk.

The design is event sourcing:

- Everything that happens is an **immutable event** appended to a log — `order.created`, `line_added`, `order.confirmed`, `kot.printed`, `payment.recorded`, `payment.refunded`.
- The log is **append-only and permanent**. Nothing is ever mutated or deleted. Corrections are new linked events. (This is a hard requirement — it's the audit trail, and in a cash business that's the point.)
- Each device **folds** its log into materialized views it actually renders: open orders, the kitchen queue, table state.
- Devices gossip events over the LAN. One is elected **hub**. When internet exists, events also go to a cloud gateway which merges them across branches.

### How we envisioned ordering

Folds must be deterministic: two devices holding the same events must render the same thing. We concluded that needed a **total order** on events that every device agrees on.

> **Correction (post-review).** That inference is wrong, and it is the root error in this document. Deterministic folds require deterministic *merge semantics* — commutative operations, monotonic state, or explicitly represented concurrency — **not** a universal total order. A reviewer pointed this out and we verified it. We have kept the original framing below because it is what we actually built and what the measurements in §4–§5 were taken against; read §8 for where this now stands.

We chose a **cloud-assigned sequence** as the authority:

```
canonical_order_key(e) = ( global_seq ?? +∞ , device_created_at , device_id , lamport_seq )
```

- `global_seq` — an org-wide integer the **cloud** assigns when an event merges. Authoritative.
- `device_created_at` — the device's wall clock at append.
- `device_id`, `lamport_seq` — deterministic tiebreakers. (`lamport_seq` here is a per-device gap-free counter, *not* a true Lamport clock — it is never bumped on receive, so it carries no cross-device causality. It's used for gap detection and delivery watermarks.)

An event with no `global_seq` yet sorts in a **`+∞` tail**, ordered among its peers by device wall clock. When the cloud assigns a `global_seq`, the event **moves out of the tail** into the finite range.

The intent was: devices operate on a good-enough provisional order, and converge onto the cloud's authoritative order when it arrives. Offline they agree with each other; online everyone agrees with the cloud.

That "converge onto the cloud's order" step is where it breaks.

---

## 3. The bottleneck

The fold engine maintains views incrementally. It has exactly one fast path:

> Apply the new event in place **iff** its canonical key is ≥ the highest key already applied. Otherwise, **rebuild the entire fold from scratch.**

A rebuild re-reads every stored event, re-parses each one, re-sorts, and re-folds.

**Assigning a `global_seq` moves an event from the `+∞` tail into the finite range — i.e. *earlier*. It therefore always misses the fast path.** Every adoption triggers a full rebuild.

And cloud fan-out is **origin-inclusive** — a device's own events come back to it stamped with their `global_seq`. So essentially *every event a device ever appends* eventually triggers one full rebuild of that device's entire ledger.

```
cost per adopted event : O(N)
cost across N events   : O(N²)
```

This is not a synthetic worst case. It's the ordinary sync path, running continuously in production.

### Why it's the worst possible shape of failure

It degrades as the restaurant gets **busier** and as the day gets **longer**. It is invisible in a pilot with 20 orders and catastrophic at 1,000. And the trigger — reconnecting after an offline stretch — is exactly the moment the system is under the most pressure.

---

## 4. Measured

Method: append N events, then have the cloud assign a sequence to all N (simulating reconnection after an offline day). Apple-silicon laptop, file-backed SQLite, quiet machine.

| events (N) | total | per event |
|---|---|---|
| 500 | 1.0 s | 2.0 ms |
| 1,000 | 4.0 s | 4.0 ms |
| 2,000 | 17.5 s | 8.7 ms |
| **10,000** | **548 s (9 min)** | **54.8 ms** |

Fitted growth exponent: **2.14** — quadratic, drifting *worse* than quadratic at scale as memory pressure rises.

**The realistic worst case is 10,000 events** (~1,000 orders × ~10 events, one offline business day). On a 2 GB tablet at 5–10× slower, that's **45–90 minutes of CPU**. Our budget is 60 seconds.

We also found a **second, independent** instance of the same mechanism: a device whose clock is merely *behind* stamps its own appends below the peer events already sitting in the tail, so it misses the fast path and rebuilds on **every local append** — with no cloud, no internet, no sequencing involved at all. Skew magnitude is irrelevant; the guard is a comparison, not a threshold, so four minutes of drift costs what ten years costs.

**That second one we have now solved** (entity-scoped recompute — rebuild only the affected order, not the ledger). 123.6 s → 1.35 s at N=10,000, genuinely O(1) per append. It's not what this document is about. It's mentioned because it shows the same mechanism has more than one trigger, and because it's why we now distinguish carefully between "reordering caused by the cloud" and "reordering caused by clocks".

---

## 5. What we tried, with results

### Attempt 1 — cheap targeted fixes (measured, four-arm ablation)

Three fixes, cumulative: **(A)** skip adoptions that can't change order; **(B)** rebuild only the affected entity; **(C)** one rebuild per delivery page instead of per event.

| profile, N=10,000 | baseline | +A | +A+B | +A+B+C |
|---|---|---|---|---|
| cloud order **matches** provisional | 614 s | 1.01 s | 0.59 s | 0.06 s |
| cloud order **differs** from provisional | ~7,970 s *(extrapolated)* | — | 1,061 s | **25.8 s** |
| clock-skew offline appends | 123.6 s | 123.3 s | **1.35 s** | 1.34 s |

**Result: solves the clock-skew profile completely. Does not solve cloud reordering.** That row stays quadratic in *every* arm — growth ratio 4.00 per doubling even with all three fixes. The constant improves ~191×; the curve does not bend. 25.8 s on the laptop is inside budget, but on target hardware it's **129–258 s — a 2–4× breach**.

**Why the residual survives:** the fixes work by scoping a rebuild to one affected entity (one order). But a significant class of events are **branch-global** — availability toggles, shift boundaries, cash drawer events, table state. They belong to no entity, so there is nothing to scope to, and each one forces a full rebuild. These are also among the most frequent events during a rush.

Two further findings from that ablation worth passing on:
- The naive entity index was **incorrect**, not merely slow — it produced genuine divergence in 30–50% of runs. The reason is recursive and instructive: a refund event names a *payment event id*, so its entity is knowable only through another event that may not have arrived yet. **The index used to escape retroactive reordering is itself subject to retroactive reordering.**
- Integer operation counts **understate** the harm, because a secondary drain mechanism is O(parked²) — one arm took 1,061 s against a 168 s counter-based prediction.

### Attempt 2 — remove the reordering entirely (refuted on correctness)

If order were fixed at append time and never revised, adoption would never reorder anything and the whole problem class disappears. So: order by a **true Lamport clock** — `causal_seq = max(everything observed) + 1`, bumped on append *and* on receive, never revised. `global_seq` demotes to a delivery cursor with no ordering role.

The appeal was that it contains **no physical-time term**, so arbitrarily wrong clocks cannot affect order at all — and clocks here are very wrong (§6).

**An adversarial review killed it.** Two findings we consider decisive:

1. **Partial observation breaks causality.** Devices see different subsets of events *by design* — a waiter's tablet is permission-scoped to its own tables and is not allowed to see payment detail, so it observes maybe 15% of branch traffic. A Lamport clock only advances on what it *observes*, so that device's clock is **permanently deflated**. It loses essentially every conflict — not because it acted later, but because it's allowed to see less. Unfixable on-device. The correctness argument silently assumed total observation.

2. **The clock is forgeable and unbounded.** One event carrying `MAX_SAFE_INTEGER` makes the mandatory `max+1` unrepresentable — append throws, and **the till stops mid-service**. Because the ledger is append-only, the poison event cannot be deleted, and it propagates over the LAN to every device. This is the same hazard we'd rejected hybrid logical clocks for, in a *harsher* form: HLC drags the clock forward but keeps working.

Also: there is no sound way to backfill existing events, because "rank within my set" is not subset-independent — devices holding different subsets would stamp *different* values on the same immutable event.

---

## 6. The constraints that make this hard

Please treat these as real. Each has bitten us.

1. **Clocks are untrusted, arbitrarily.** Not "skewed by seconds" — a device may read 10 years behind, 3 years ahead, or a hand-typed `1 Jun 2029`. Cheap tablets with dead RTCs. **Every device in a branch may be wrong simultaneously and differently**, so there is no quorum of good clocks to appeal to.
2. **Append-only is absolute.** Nothing is ever mutated or deleted. A bad event is permanent; it can only be compensated by another event. This eliminates most "just clean it up" recoveries.
3. **Devices see different subsets by design.** Permission slices are a product requirement, not an optimisation. Any scheme assuming everyone observes everything is invalid.
4. **A whole day offline is routine.** ~10,000 events with no cloud contact at all, then a reconnection burst.
5. **The sale is never blocked.** Any mechanism that can throw, stall, or wait on consensus in the append path is disqualified.
6. **Convergence is required.** Devices holding the same event set must reach byte-identical state.
7. **Constrained hardware.** 2 GB Android tablets, embedded SQLite, and a 500 MB memory ceiling for the whole kernel.
8. **No trustworthy central authority when offline** — which is most of the time for most devices.

---

## 7. Already considered and rejected — please don't re-suggest without new information

- **Kafka / Kafka Streams / any log-broker.** Requires a reachable broker. Our devices are frequently on an isolated LAN with no server at all, and must keep taking money. It solves ordering *given* connectivity; connectivity is the thing we don't have.
- **General incremental view maintenance engines** — DBSP, differential dataflow, Materialize, Feldera. We did a substantial literature pass. They are **order-agnostic by construction**: they maintain multiset *membership*, not *position in a total order*, so they don't natively address "this event's sequence number moved." DBSP's authors explicitly footnote the degenerate case where a small input change perturbs every output row and incremental evaluation collapses to full-query cost — that degenerate case is exactly ours. Noria, the one system in the set that reasons explicitly about ordering, treats order preservation as a correctness *requirement* with no repositioning mechanism.
- **Hybrid logical clocks.** Rejected because the threat model (§6.1) removes HLC's premise — it needs *some* roughly-correct clock — while keeping its hazard: monotone `max` means the fastest clock in the fleet drags everyone to 2029 permanently.
- **Pure Lamport / causal order.** §5, attempt 2. Refuted on partial observation and forgeability.
- **Trusting device wall clocks.** §6.1.

---

## 8. The actual question

> **How do you incrementally maintain materialized views over an append-only event log, when the canonical total order is assigned retroactively by a central authority that is frequently unreachable — without quadratic re-folding — given untrusted clocks and deliberately partial observation?**

Three shapes of answer we can see, and we don't know which is right:

**(a) Keep the cloud as ordering authority; make adoption cheap.** Requires making a position change cost O(1) rather than a replay. Our scoping attempt failed on branch-global events (§5) and on the index being itself order-dependent.

**(b) Fix order at append time.** Removes the problem entirely, but any such scheme must survive *both* untrusted clocks *and* partial observation. We haven't found one that does — that's exactly the pair that killed attempt 2.

**(c) Make order matter less. ← this is now the working direction, after review.** Instead of replaying to determine order-sensitive values, store the deciding key *alongside* each order-sensitive field, so adopting a new order is an O(1) comparison per field rather than a fold replay — a CRDT-register-flavoured approach. **This is the one candidate we have neither implemented nor refuted.** Our order-sensitive fields are few and simple: first-wins timestamps, one last-wins table assignment, accumulating money totals, and a state machine. If you think this is the answer, we'd especially like to hear why — and where it breaks for the state machine and the money accumulators, which are the parts we're least sure about.

### What a genuinely useful answer looks like

Either a named technique with prior art we can go read; or a concrete argument that one of §6's constraints is softer than we think; or a specific failure mode in (c) that we haven't seen. "It depends" and "have you considered CRDTs" (yes — that's (c), we want the specifics) won't move us.

---

## 9. Appendix: things we got wrong, so you can calibrate

We've been wrong several times here. Offered so you can judge how much to trust the rest:

- We claimed a 3-line "skip no-op adoptions" guard would fix the reconnection storm. It only works when the cloud's order happens to *match* the provisional order — an artifact of our first benchmark's fixture. In the realistic case it's worthless.
- We worried our in-memory benchmarks understated real costs by hiding disk sync. Measured: only 1.5–14% difference. The workload is CPU-bound on parsing, not I/O.
- Our first benchmark used only dependency-free events, so the dependency-parking machinery never ran. The realistic fixture parks ~18% of the ledger, and that path has its own quadratic.
- An early timing claim (57 s for a test file) was contaminated by machine load; the true figure was ~23 s.
- We recommended the causal-order design (§5 attempt 2) as settled before it had been adversarially reviewed. It was refuted within a day.
