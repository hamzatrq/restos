# 26 — Merge Semantics: per-fold convergence without a universal order

**Design record — Draft 1, July 2026** · Parent: `00-platform-overview.md`. Owns how device folds (`01-F6`, `01-F34`) converge **without** a universal total order. Split out of `25-fold-performance.md` (which retains the measured O(N²) defect and the refuted proposals) when that document hit the `23-F3` size cap.

> **This is the live position.** `25 §8/§9/§13` are superseded and `causal_seq` is refuted — see `25`'s STATUS banner for why. Read `25 §2`, `§3` and `§17` for the measured evidence this design responds to.

---

## 1. The framing error

An external review (July 2026) argued this document has been solving the wrong problem, and the argument holds. **This section supersedes §8, §9 and §13 as the live position.**


`§1` and the external problem statement both assert that deterministic folds require a **total order**. **They do not.** They require *deterministic merge semantics*: operations that are commutative, state that is monotonic, or concurrency that is represented explicitly rather than silently arbitrated. `01-F34` already gestures at this ("every fold is commutative and idempotent") — the universal comparator in `replay.ts:117` then quietly does the opposite, arbitrating *everything* through one order.

## 2. Sync metadata decides business outcomes

**Sync metadata currently decides business outcomes.** Cloud receipt order is an artifact of *who reconnected first*. Today it determines which table assignment wins (`replay.ts:260`), which confirm/KOT timestamp anchors (`:242`, and from an untrusted device clock), and potentially which of two competing state transitions applies (`:287`). Cloud arrival order is a legitimate **delivery cursor**; it is not a reliable expression of staff intent, and it should never have been load-bearing for either.

That reframing dissolves the §9 question. "Cloud authority vs stable append-time order" is a choice between two ways of arbitrating a global order — when the fix is for most projections not to need one.

## 3. The model

Roles become narrow and non-overlapping:

| field | sole role |
|---|---|
| `global_seq` | cloud delivery / catch-up cursor. **Zero fold work on adoption.** |
| `lamport_seq` | gap-free per-origin transport + audit counter |
| `device_created_at` | forensic hint. Not order, not business time |

Plus a **projection-key sidecar**: the domain registry deterministically returns every key an event affects (`order:O1`, `item:I4`, `table:T2`, `shift:S8`), indexed in SQLite and derived from validated payloads. This is the generalisation of §17's entity index — and per `25 §17`'s correction, the real branch-global events *are* row-keyed, so they fit it.

Then each fold declares its own merge rule instead of inheriting the comparator:

| data | merge rule |
|---|---|
| lines keyed by `line_id` | map/set union |
| payments & refunds | unique attempt/event map, then sum |
| confirmed / printed facts | monotonic boolean or set |
| table assignment, availability | multi-value register, or a product-defined concurrent policy |
| line workflow | predecessor-linked transition DAG; concurrent heads surface as a visible conflict |
| timing | the separate branch/server time layer (`DEC-TIME-001`) |

## 4. Two concrete defects this exposes

1. **`payment.refunded` should carry `order_id` directly**, alongside `payment_id`, validated against the parent when it arrives. Verified: `payment.recorded` *has* `order_id`; `payment.refunded` has only `payment_id` (`registry.ts:53`). That asymmetry is the entire source of the late-resolving-entity trap that made the naive index diverge in 30–50 % of runs (`25 §17`). **A one-field schema addition removes the recursive problem** that a two-table back-filled index was being designed to work around. No production data exists, so it is free now.
2. **The parked-list drain is an independent quadratic.** `replay.ts:333` re-attempts the whole parked list on every applied event. Indexing parked events by `waiting_for` and retrying only those waiting on the newly-arrived reference removes it. §17 measured this biting hard: one arm took 1,061 s against a 168 s counter-based prediction because `drain()` is O(parked²).

## 5. Prior art

Monotonic / semilattice operations converge without delivery ordering (CALM; Conway et al., *Logic and Lattices for Distributed Programming*, Bloom^L). Non-commutative operations can use a **partially ordered** operation log rather than a total one (*Pure Operation-Based CRDTs*, arXiv:1710.04469). Multi-value registers can retain concurrent values while presenting a deterministic default (Automerge conflict model). **Borrow the patterns; do not adopt a general CRDT framework** — the machinery is not the hard part, the restaurant-specific merge semantics are.

## 6. Completing the path — what the ordering fix does NOT cover

A second external review (July 2026) accepted the this design and then pointed out that it is **necessary but not sufficient** for the headline target. Verified against the code:

**1. The budget is END-TO-END, and every measurement in this document is CPU-only.** `00 §5` reads *"sync catch-up after 8h offline with ~500 orders **< 60 s on 4G**"* — the 60 s includes **network transfer**. `25 §3`, `25 §17` and every figure here measure fold CPU in isolation. A perfect fold fix therefore does **not** demonstrate the budget is met.

**2. Target definition.** The contracted figure is **~500 orders after 8 h offline**. The **10,000-event** figure used throughout `25 §11–§17` is *branch-wide full-day stress* — legitimate as a safety target (an order genuinely produces ~8–15 events across create/lines/confirm/kitchen/print/pay, so 1,000 orders exceeds 10,000 events), but it is **not** the contract and must be labelled as such wherever it is quoted. Note also that 10,000 is a **branch** total: `01-F39`/`01-F14` mean counter, kitchen and manager retain the full stream and may hold all of it, while waiter and rider hold scoped slices and hold far less.

**3. Why §18 nonetheless dissolves the headline case.** On the normal outage — **WAN down, LAN healthy** — every device has already folded those events incrementally as they arrived over the LAN. Reconnect is then *purely* the cloud attaching delivery metadata to events the device already has. Under the current code that harmless acknowledgement of 10,000 already-known events is what detonates into quadratic replay (`device-store.ts` adoption path). With `global_seq` as a zero-fold-work delivery cursor, that cost **goes to nothing** rather than merely getting smaller. This is the single strongest argument for the this design.

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

## 7. The matrix — result

Full artifact: **`plans/wave-0/merge-semantics-matrix.md`** (5 domain drafts → 4 adversarial critic lenses, 41 findings / 18 P0 → revision → synthesis; all claims verified against `registry.ts`, `states.ts`, `replay.ts`, `FOLDS.md`).

**The design works.** The "still requires an ordering mechanism" list has **four entries, and only one touches a device fold**:

| # | Field | Mechanism | Runs at |
|---|---|---|---|
| 1 | Naming *which* refund busted the `01-F29` remainder | gateway `global_seq` (DEC-SYNC-007) | cloud |
| 2 | Naming which member of a divergent `settlement_attempt_id` is the impostor | gateway merge order + `01-F37` | cloud |
| 3 | The compaction / snapshot boundary for a rebuild over a pruned log | `global_seq` as a **prune watermark only** | **device** |
| 4 | Migration cutover for pre-`line_context` line events | one-off cutover boundary | device — **deletable** (no production data; make `line_context` required) |

Everything else across all six folds converges with **zero ordering metadata** — no `global_seq` read, no `lamport_seq` read, no clock read. §3's "zero fold work on adoption" is met **structurally**, not by optimisation.

**`01-F29`'s parenthetical "(fold-enforced)" is unimplementable as written and needs a spec correction.** The *set* predicate `Σ refunds > cap` is order-free and converges everywhere; *"which refund was later"* is definitionally a function of sequence, not of the set. No join over an unordered set produces it, and implementing it fold-side would reinstate the universal order §2 removes.

### Things that look like ordering problems and are not

Conflating *order* with *time*, *bucket* and *completeness* produced most of the defects the matrix corrects:

| Looks like ordering | Actually needs |
|---|---|
| shift/day/drawer bucketing of a payment | a **carried key** |
| `shifts.open_at`, `confirmed_at`, `day.business_date` | a **time source** (`DEC-TIME-001`) |
| `01-F30` conservation | a **closure** mechanism (Auditor over the merged log) |
| `orders.settled` | an **event** — a derived predicate over an append-only log cannot be both monotone and a pure function of the set |
| duplicate shift/day open, table anchor chains | a **carried causal link** (`prev_shift_id`, `supersedes[]`) |
| over/short, COD due | a **carried fact** |

### The highest-leverage additions

`order.settlement_closed` as a new `01 §4` event type gates the money, table **and** line domains at once. `payment.refunded` needs `order_id` **and** `settlement_attempt_id` (both already spec-mandated). `supersedes[]` on `order.table_assigned` is *the only thing that makes the table anchor converge at all*. `table.state_changed`, `availability.changed`, `order.merged`, `shift.*`, `cash.*`, `void/comp/discount.recorded` and `payment.split_recorded` have **no payload schema at all** — three of the four RHS terms of `01-F30` therefore evaluate to zero today.

Two unstated laws the whole algebra rests on: **`settlement_attempt_id` uniqueness scope** (must be org-global, UI-minted, UUID-class — if any device mints a per-device counter, two distinct payments collapse and cash vanishes silently), and **`01-F40` slicing must be order-granular** for line events.

`min(envelope.id)` is **banned as a value tiebreak**: `00 §6` pins ids to UUIDv7 whose leading 48 bits are the minting device's wall clock, so id-min is min-wall-clock wearing a disguise. Use `payloadHash` — a clock-neutral primitive to add in `domain`.

### Unresolved — do not treat the matrix as complete

The fix **created** one problem: entitlement-union routing (grow-only, which is what makes it monotone) contradicts `04-F17`'s privacy law once an order moves between waiter sections — either it violates the privacy rule permanently, or it is trimmed on move and stops being monotone, which is the defect it was written to remove. **Genuinely open, needs an architecture ruling.** Also open: hub-as-business-emitter has no failure story and no owner (`01-F13` can elect a *kitchen* tablet as the authority for table states, which `FOLDS.md` does not even register for that class). And two hazards are provably unfixable by any algebra — availability subset-blindness and slice-blind conflict invisibility are **missing-data** problems requiring a delivery-completeness mechanism nobody has specced.

## 8. Prototype results — the three hard cases converge (July 2026)

All three §7 prototypes are green (matrix Addendum has the full tables and corrections): **money** 13/13, **tables** 6/6, **lines** 13/13 — every P0/P1/P2 counterexample constructed exactly and survived, including the ack-boundary flip (identical event set, `settled` invariant across the `global_seq` boundary), the khata repayment (no "overpaid" state — overpayment is *underivable*, `billed` never enters the fold), and the partition-heal settle case that wedged permanently under the naive AND-guard.

Combined algebra: **~470 non-blank lines** across all three hard cases. No comparator, no clock, no sequence — enforced **dynamically** (Proxy-poisoned envelopes that throw on ordering-metadata reads; garbage sequence/clock injection; bijective id relabeling including order-reversing).

**Binding lesson for the real acceptance suite:** a min-envelope-id tiebreak **passes plain convergence** — it is convergent-and-wrong (min-id = min-wall-clock via the UUIDv7 prefix). Only bijective-relabel invariance kills it. The suite must therefore include relabel + injection invariance, and the old refold-equivalence gate — which would have blessed min-id — must not be ported.

The prototypes returned ~20 corrections to the matrix (cap resolution by `settlement_attempt_id`; whole-payload immutability; `conflict_visibility` non-monotone, clears on backfill; ≼-max over all legal edges, not heads; cooking-done includes `picked_up`; and more — see the Addendum). The §6.1(a) privacy exposure is **measured**: one business day of order/line-plane visibility (Rs-hundreds scale), zero money-plane leakage, and the trim alternative demonstrably re-creates the slice-blind defect.

## 9. Status

**RATIFIED (founder, July 2026).** Merge semantics is the selected design; `DEC-PERF-001` is accepted and promoted — `01-F34` is rewritten, `01-F29/F30/F31/F32/F33` amended, `order.settlement_closed` added to the `01 §4` catalog. The schema additions of §7, the measured `04-F17` privacy trade, and hub-as-business-emitter are ratified. Implementing task: **T-01-15** (fold engine + domain schemas). Still open, deliberately: `DEC-TIME-001` (the time layer — `confirmed_at`/`kot_at` value stamping is unchanged until it lands) and three §5-class product constants (availability winner among concurrent heads; "keep the change"; the two-head KOT header) — each is one constant, none blocks the engine. `DEC-PERF-001` remains open, `causal_seq` is not to be implemented, and **T-01-14 is paused** — not because its work is wasted (the projection-key sidecar is needed under every candidate) but because it was scoped to an *entity* index and a back-filled workaround for a trap that a one-field schema fix removes.

Next: a merge-semantics matrix for the eight implemented events plus availability/table/shift/cash — *affected keys · dependencies · merge algebra · concurrent UX · time source* — then prototype only the three hard cases (payment/refund totals, concurrent table assignment, competing line-state transitions). **The acceptance oracle changes shape too:** fold-specific convergence, not equality to one universal canonical replay.
