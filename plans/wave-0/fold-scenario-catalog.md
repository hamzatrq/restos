# Fold / ordering scenario catalog — 74 scenarios

**Generated July 2026** (237 candidates → 74, via nine family-expert passes + four adversarial critic lenses).
Companion to `specs/25-fold-performance.md`. Source of truth for what a fold/ordering harness must cover.

> **Read `# Risks to the proposed design` FIRST.** It contains the entries that refute parts of
> `25 §13`/`§16`. Several are P0 blockers on ratifying `DEC-PERF-001`, and Batch 6 is the
> pre-ratification gate. Batches 1–5 are the build order; Batch 7 is the evidence pack.

---

I read `specs/01-kernel-sync.md`, `specs/25-fold-performance.md`, `specs/DECISIONS.md`, `folds/replay.ts`, `device-store.ts`, `mesh-session.ts`, and `hub-election.ts` before merging, and verified the load-bearing code claims (unconditional `recomputeFolds` in `assignGlobalSeqTx`; `readAllEvents()` sorting by `(device_id, lamport_seq)` not canonical order; `replayWindowTo` on every 2 s heartbeat; `refoldTx()` unconditional at open; `settlement_attempt_id` read by no fold or dedupe path; `acc.refund_total +=` with no remainder bound; `hub-election` taking only `{device_id, device_class}`). Every FR ID below greps to a spec.

---

**237 candidates → 74 final scenarios.** The largest merges: 13 candidates describing "adoption rebuilds unconditionally" collapse into F01; 13 describing "a behind clock makes every local append rebuild" collapse into F02; 12 migration candidates collapse into F66–F68. Discarded outright: the four physical-rig thermal/battery entries (D3 by declaration, not harness-buildable), the backup-replay entry (assertion subsumed by F76's conservation check), and two forward-looking time-layer entries with no implementation to test against (subsumed by F64/F78).

Batches are ordered so each reuses the previous batch's machinery. **Batch 6 is the pre-ratification gate for DEC-PERF-001** and Batch 7 is the evidence pack; neither should be deferred behind Batches 1–5.

---

# Batch 1 — Single-store integer instrumentation (no transport)

Machinery: `openStore` on a **file-backed** path with shipped pragmas, spies on `createFoldEngine.rebuild`, `parseEvent`, `readAllInputs` row count, `writeFullTables`, peak parked length. Everything here asserts **exact integers**, not wall clock — 25 §3 forbids benchmarking on a loaded machine, and CI is loaded by definition.

| id | title | pri |
|---|---|---|
| **F01** | **Adoption triggers zero rebuilds** | **P0** |

*Setup:* Append N=2,000, then `assignGlobalSeq` once per event in origin-inclusive fan-out order. Variants covering own-event ack, peer arrival with finite seq, and `audit.*` (fold-inert, provably no-op).
*Assert:* `rebuildCount === 0`; `parseEventCount === N`; `writeFullTables === 0`.
*Current:* `rebuildCount === N`, `parseEvent ≈ N²/2`. `assignGlobalSeqTx` never reaches the fast-path guard — the rebuild is unconditional.
*Causal:* 0. `global_seq` is a sidecar write.

| **F02** | **Skew-invariance of local append** | **P0** |

*Setup:* Interleave peer ingest (stamps ≈ now) with own appends stamped behind. Sweep skew {1 ms, 4 min, 10 min, 3 y, 10 y} × interleave {1:1, 1:10} × N {250, 1k, 4k}. 4 min is deliberately under the 01-N2 flag threshold.
*Assert:* `rebuildsFromAppend === 0` in every cell, and invariant to skew magnitude.
*Current:* `rebuildsFromAppend === appendCount` at every magnitude — the guard is a comparison, not a threshold, so 1 ms costs what 10 years costs. Reproduces 25 §3 B2 as an integer.
*Causal:* 0 everywhere. `causal_seq = max(observed)+1` cannot sort below the tail.

| **F03** | **The +∞ tail latch** | **P0** |

*Setup:* Three arms that pin `maxKey` at `+Infinity` permanently: (a) one unsequenced local event held in the outbox; (b) one cloud-quarantined event that will never receive a `global_seq`; (c) one **parked** event stamped +3 y (`apply` sets `maxKey` *before* `attempt`, so a never-applied event still raises it). Then drive 1,000 sequenced cloud arrivals.
*Assert:* `rebuildCount === 0` across all 1,000, and still 0 on a second wave.
*Current:* 1,000 rebuilds in every arm, permanently — `rebuild()` re-derives `maxKey` from the same stored set, so it never self-heals. Arm (c) is invisible: the poisoning event appears in no fold row.
*Causal:* Unreachable in all three arms — no `+∞`, no physical-time term.

| **F04** | **Parked-list cost: drain O(N·P) and full parked rewrite per append** | **P0** |

*Setup:* Arm A empty parked table; Arm B 200 permanently-parked children (quarantined parent per 01-F37, or departed origin per DEC-SYNC-006). 200 fast-path appends each; then one `refold()` at N=5,000.
*Assert:* Per-append cost and parked-table INSERT count independent of P; rebuild is O(N), not O(N·P).
*Current:* Every successful `apply` calls `rewriteParked()` = `DELETE FROM parked` + P inserts under `synchronous=FULL`; `drain()` re-attempts all P per applied event, so a rebuild is O(N·P). Never measured — 25 §3 explicitly parked nothing.
*Causal:* Rebuild frequency collapses so the O(N·P) drain largely goes, but **`rewriteParked` on the fast path is untouched** — a delta-write is a separate required fix.

| **F05** | **Hot tab O(L²) and shape inversion** | **P1** |

*Setup:* 200 `line_added` on ONE order vs the same count across 200 orders. Then two 10,000-event ledgers: 1,000×10 (wide) vs 100×100 (deep).
*Assert:* Per-append cost near-constant in the entity's own history; bytes written O(L) not O(L²). Both shapes inside the 25 §11 budget.
*Current:* `projectAcc` re-serializes the whole lines map and `upsertOrder` rewrites the growing `json_lines` on every append — O(L) per append, O(L²) per tab. Wide shape is dominated by rebuild WRITES (DELETE-all + re-INSERT ~1,000 rows), invisible in the `:memory:` benchmark.
*Causal:* Wide shape fixed. Deep shape unchanged — and 25 §7 option B makes it **worse**, since a scoped recompute of the hot entity is itself O(L).

| **F06** | **Rebuild transient allocation and double Zod parse** | **P1** |

*Setup:* Peak heap during one `recomputeFolds()` at N ∈ {1k, 10k, 30k} under `--max-old-space-size` emulating the 01-N3 500 MB budget.
*Assert:* ≤ 500 MB at N=30,000; **at most one envelope Zod parse per event per rebuild**.
*Current:* Every envelope is Zod-parsed twice (`registry.ts` re-runs `parseEnvelope` inside `parseEvent` on an already-parsed object) plus a payload parse — pure waste on the fallback path, and the mechanism behind 25 §3's 1.99→2.14 exponent drift.
*Causal:* Same peak per rebuild; hit once at open instead of once per adopted event.

| **F07** | **Residency: compaction bounds the ledger, not the fold state** | **P0** |

*Setup:* 5 consecutive business days × 10,000 events, running the 01 §5 compaction at each boundary. Sample RSS, `orders.size`, `appliedPayments.size`, fold-table rows.
*Assert:* Entry counts bounded by the rolling window not cumulative history; RSS ≤ 500 MB (01-N3) at day 5; after compaction `refold()` of the surviving ledger === the live accumulator, byte-for-byte.
*Current:* `appliedPayments` maps every `payment.recorded` id forever; settled orders stay as live accumulators. No compaction exists in `packages/` at all, so written naively it prunes ledger rows only — the mechanism specified to enforce 01-N3 touches none of the structures that breach it. 01-N3 is itself deferred to D3 by `wave-0-scope.yml`.
*Causal:* **Unchanged, and see F61 — the rebuild is currently the only thing that ever resets these Maps.**

| **F08** | **File-backed reality: WAL, fsync, pragmas** | **P0** |

*Setup:* Re-run 25 §3 B1 at every N with `openStore({path: <tmpfile>})` and the shipped pragmas, on a realistic mixed ledger. Then feed one 500-event catch-up page to a store holding 1,000 open orders, sampling `-wal` size across the transaction. Re-measure with `cache_size` sized to the working set and `mmap_size` set.
*Assert:* Publish the file-backed B1 table and amend 25 §3 with it; the 60 s T5 budget is evaluated against it. **Any Phase-1 acceptance run using `path: ":memory:"` fails the gate.** Peak WAL bounded independently of open-order count.
*Current:* `ingestBatchTx` wraps the whole page in ONE transaction; each in-transaction rebuild does DELETE-all + re-INSERT of every fold row, so WAL cannot checkpoint and grows monotonically — ~500×1,000 row writes in one uncheckpointable transaction. Only three pragmas are set, so `readAllInputs`'s two unindexed full scans thrash a ~2 MB default cache.
*Causal:* Fold writes become targeted upserts; WAL checkpoints normally. Pragma tuning is cheaper than any option in the 25 §7 table and is not in it.

| **F09** | **One unreadable row vetoes startup** | **P0** |

*Setup:* 10,000 good rows; corrupt exactly one, three arms — truncated envelope JSON (eMMC page after repeated plug-pull), a row valid only under a newer `schema_version` (app-store rollback), a zeroed SQLite page. Call `openStore`.
*Assert:* Returns a usable handle with the bad row quarantined per 01-F37 and surfaced to fleet health (15-F14); sales remain appendable (01-F17); the excluded count is reported, never silent.
*Current:* `refoldTx()` runs unconditionally before `openStore` returns and `parseEnvelope` throws — every future open throws. Permanent, mid-service, no operator-actionable error. A device that could sell against 9,999 rows refuses to open.
*Causal:* Identical, and blast radius grows with any design that enlarges the open-time fold input set.

| **F10** | **Mutation-test the oracle** | **P0** |

*Setup:* Deliberately corrupt `byCanonicalOrder` (reverse the `device_id` term, drop `lamport_seq`, make it non-transitive) and run `folds-properties.test.ts`'s four laws. Then add three independent oracles: ~30 table-driven fixtures with externally-computed expected canonical orders; **01-F30 conservation asserted inline in the fold**; a device-fold vs cloud-Auditor differential.
*Assert:* Every comparator mutation fails at least one oracle.
*Current:* All four laws stay GREEN under every mutation — both sides of every comparison call the same comparator. 25 §10 names refold-equivalence as THE guard for every option in the document, and it is self-referential. FOLDS.md declares the conservation check; `replay.ts` contains none.
*Causal:* Identical weakness, at its maximum precisely when the thing under test *is* the comparator.

| **F12** | **Exactly-reversed delivery — guard calibration control** | **P2** |

*Setup:* Build 2,000 events on X, ingest the identical set into Y in exactly reverse canonical order.
*Assert:* Correctness holds (Y === X === `refold()`); report rebuild count under both keys.
*Both:* 1,999 misses. **The equality is the finding** — it isolates the fragile component as the `>= maxKey` guard plus whole-ledger fallback, not the choice of key.

---

# Batch 2 — Two-device LAN: ordering correctness

Machinery: `SimLan`, injectable `Clock`, two stores, fold-state byte-diff helper.

| **F13** | **Behind-clock kitchen strands a line at `confirmed`** | **P0** |

*Setup:* Counter confirms + `line_state_changed → confirmed`; LAN-only kitchen tablet 4 min behind appends `→ in_prep` then `→ ready`. No WAN, so nothing is ever sequenced.
*Assert:* Line reaches `ready` with an empty anomalies map and `lines_ready === 1`; 0 rebuilds on the kitchen arrivals.
*Current:* `in_prep` sorts before `confirmed`, so `placed→in_prep` is illegal → `illegal_transition` anomaly, then `confirmed` applies, then `confirmed→ready` is also illegal. **The line is stuck at `confirmed` for the rest of the offline day and nothing self-heals.**
*Causal:* Bump-on-receive makes the chain legal by Lamport's theorem. This is the cleanest correctness win of the proposal.

| **F14** | **Void-vs-served flips the money answer on ack** | **P0** |

*Setup:* Line at `ready`, `payment.recorded` folded. Concurrent `→voided` (counter, dca 1000) and `→served` (waiter, dca 990, clock behind). Then cloud assigns void=41, serve=42.
*Assert:* `orders.settled` and `json_lines` snapshots taken before and after `global_seq` assignment are byte-identical.
*Current:* Provisionally serve wins → `settled=1`, nothing owed. After adoption void wins → `billed_effective=0`, `settled=0`, 50,000 paisa of unmatched payment. Same event set, two different money answers, plus 2 full rebuilds.
*Causal:* Decided once at append; stable across the ack boundary. (Which one wins is arbitrary — the assertion is stability, not the winner.)

| **F15** | **Table LWW: flips on ack, and never-sequenced permanently wins** | **P0** |

*Setup:* Three arms. (a) Both devices sequenced, cloud arrival order inverts causality (correction undone). (b) DEC-SYNC-009 deployment: waiter is LAN-only so its event is *never* sequenced while the counter's is. (c) A tablet found weeks later pushes 1-June events that receive today's `global_seq`.
*Assert:* `orders.table_id` is invariant across the push_ack boundary on every device, in every arm.
*Current:* (a) flips from 12 to 7 minutes after staff seated the party. (b) **finite always sorts before `+∞`, so the waiter's stale write beats every counter correction, systematically, for the life of the branch** — not a race, a structural inversion. (c) the month-old assignment becomes canonically last and overwrites a month of corrections. Each adoption is also a full rebuild that produces the *wrong* answer — 25 §7 option A would not fire here.
*Causal:* Fixed in all three; and note (b) is fixed *without* T-01-12 landing.

| **F16** | **A quarantine hole inverts a device's own lamport stream** | **P0** |

*Setup:* One device, one line, strict lamport L0…L6. Force L5 (`→ready`) to quarantine at the gateway (`storage_reject` via U+0000 in a note, or deploy skew). Per DEC-SYNC-005 the slot is filled and the ack advances. Push, fan back.
*Assert:* `json_lines` for the line is byte-identical before and after ack: `state === "served"`, `anomalies === {}`.
*Current:* Canonical order becomes L0…L4, L6, L5. `in_prep→served` is illegal → anomaly; then L5 applies. **The line regresses from `served` to `ready`** — the pass screen un-serves a served line, exactly what 01-F35 forbids, caused by cloud sequencing plus quarantine slot semantics rather than by any bad event.
*Causal:* Fixed. (The underlying device/cloud fold divergence is *not* — see F30.)

| **F17** | **Anomaly flags appear and vanish on ack** | **P1** |

*Setup:* Two-device line transition with clocks disagreeing; capture `json_lines`, assign `global_seq`, capture again.
*Assert:* Byte-identical; and no anomaly recorded in `json_lines` is ever removed by a later fold (monotonic retention).
*Current:* The `illegal_transition` badge is not moved — it is **erased**, with no event recording it existed. 01-F35's retention promise holds only until the next reorder.
*Causal:* Zero anomalies from the start.

| **F18** | **`confirm_at` / `age_basis` moves by push order** | **P1** |

*Setup:* Duplicate `order.confirmed` from two terminals 90 s apart by clock; push B-then-A and A-then-B.
*Assert:* Queue row's `confirm_at`/`age_basis` identical before and after both acks, both arms.
*Current:* First-wins is decided provisionally by `device_created_at` and afterwards by push-arrival order, so the kitchen ticket's age jumps 90 s *after* it is on the pass screen, as a function of which radio connected first.
*Causal:* Stable — but honestly, the **value** is still wrong (still raw `device_created_at`). Assert stability only; correctness is F64/DEC-TIME-001.

| **F19** | **Perfect clocks, LAN jitter alone: ~50 % miss rate** | **P0** |

*Setup:* Two arms, zero skew. (A) shared clock, LAN delay U(5, 800) ms, 1,000 events at ~2/s alternating. (B) 5 devices, frozen clock so every stamp ties exactly, randomized per-tick delivery.
*Assert:* `miss_rate ≤ 0.05` in arm A.
*Current:* ≥ 0.40 in A (delivery latency exceeds the inter-append gap, and the guard is a comparison so 1 ms below counts); ≥ 0.75 per non-maximal device in B. **This is the O(N²) shape with zero skew, zero cloud, zero WAN** — never measured, since 25 §3 B2 only swept offset magnitude.
*Causal:* Materially better in A (causal clocks stay near-lockstep) but **not zero**, and B is unchanged. If the causal arm does not beat the clock arm in A, 25 §16's budget projection is invalid — the test must fail loudly on that.

| **F20** | **Tie regime: `device_id` becomes a permanent privilege** | **P0** · RISK |

*Setup:* (a) Realistic 4-device rush, 2 h, ~3,000 events — count pairs tying on the primary term and the per-device winner distribution across `table_assigned`, `availability.changed`, duplicate confirm, duplicate `line_id`. (b) The iftar burst: near-zero trade from noon, 60 held tickets, all four devices fire `order.confirmed` + `kot.printed` inside 2 s (~240 mutually-concurrent events) at N=2k and 10k, under the contended-airtime model.
*Assert:* Winner distribution over genuinely concurrent conflicts is independent of device identity (no device > 60 %); LAN p95 < 1 s for the burst (01-F15); rebuild count during the burst is O(orders touched).
*Current:* `device_id` is the **third** term, reached only on an exact millisecond collision — rare and roughly symmetric. But the burst is a rebuild catastrophe: most arrivals sort below the tail, each a full rebuild of the day's ledger, on the highest-revenue night of the year.
*Causal:* Rebuild cost collapses, **but `device_id` becomes the second and final term and causal_seq collisions between devices are the NORMAL case** (two devices observing similar traffic sit at similar counters by construction). `device_id` is fixed at 01-F25 registration, so one tablet wins every concurrent race for the life of the device. Fairness replaces cost as the failure.

| **F21** | **Multi-line transition parks wholesale on one late `line_added`** | **P1** |

*Setup:* Order with L1/L2/L3; counter holds only L1 and L2; kitchen sends `line_state_changed{[L1,L2,L3] → in_prep}` then `→ ready`.
*Assert:* Pins the unspecified design choice — either partial application (L1/L2 read `in_prep`) or atomic parking confirmed and written into 01-F10. Final state after L3 arrives must equal parent-first delivery order.
*Current:* `attempt` collects `missing` in one pass and returns before applying anything, so the whole event parks: the counter shows `lines_ready=0` on a fully-cooked ticket for ten minutes. The `parked.waiting_for` column carries three different kinds of identifier depending on branch, so no operator surface can resolve it.
*Causal:* Identical — parking is a dependency mechanism, not an ordering one. Not fixed by DEC-PERF-001.

| **F22** | **Park-and-drain guarantees a rebuild** | **P1** |

*Setup:* Drop each `order.created` frame so children arrive first, 300 times.
*Assert:* 0 rebuilds while draining; post-drain state === `refold()` with `parked` empty.
*Current:* 300 rebuilds. The parent is authored earlier so it always sorts below the parked child.
*Causal:* **IDENTICAL — 300 rebuilds.** `causal_seq(parent) < causal_seq(child)` is exactly what Lamport guarantees. The two out-of-order tolerance mechanisms in the kernel cannot both be on the cheap path under either key.

| **F23** | **Count what staff actually see flip** | **P1** |

*Setup:* Instrument every fold write with a per-field change log. Replay one identical seeded schedule (normal service with continuous acks; a 25-min partition heal; the iftar burst) through both comparators. Count value flips after first display and how long each superseded value was shown.
*Assert:* Zero flips attributable to `global_seq` adoption (integer); no kitchen-queue row changes position more than once after first display. **A design that halves rebuild cost and increases visible churn fails this even if every convergence assertion passes.**
*Current:* Unquantified. 01-F34 guarantees convergence, not stability, and the two are experienced completely differently.
*Causal:* Adoption churn structurally zero. The only axis comparing the two keys as customers experience them.

---

# Batch 3 — Cloud sim: sequencing, cursor, quarantine

Machinery: `SimCloud` + the real gateway on Testcontainers Postgres for the identity/quarantine entries.

| **F24** | **Live fan-out advances the cursor past an in-flight catch-up page** | **P0** |

*Setup:* Reconnect at `last_global_seq=100`, stream to 1200. Page one (101–600) sets the cursor to 600; a live `event_batch` at 1200 sets it to 1200; drop the socket; reconnect issues catch-up from 1200.
*Assert:* Stored id set ⊇ every gateway event ≤ 1200.
*Current:* 601–1199 are **never fetched, permanently** — `applyEvents` advances to the batch maximum and paging resumes from the store cursor rather than the last paged position. For a WAN-only device those orders are silently absent forever.
*Causal:* **UNCHANGED** — a delivery-cursor bug. Under demotion `global_seq` *is* the cursor, so this survives verbatim and must be fixed independently.

| **F25** | **PITR restore re-issues used `global_seq` and wedges every device** | **P0** |

*Setup:* 22-F7 restore-and-tail-heal (or the quarterly 22-F8 drill). Server rewinds below 5,000; re-pushed events receive different `global_seq` values.
*Assert:* Cursor advances past them within one catch-up round; catch-up reports `complete`; no unhandled exception escapes `applyEvents`.
*Current:* `adoptGlobalSeq` throws "cloud order is immutable" (or `UNIQUE(global_seq)` fires); the throw is not a `DivergentDuplicateError`, so `blocked=true` and the cursor never advances. **Every reconnect re-throws — the pull is permanently wedged org-wide, visible only as a frozen `last_global_seq`.**
*Causal:* The reorder harm disappears but **the throw likely survives** — 25 §15 keeps `global_seq`'s transport role and says nothing about relaxing sidecar immutability. Real second-order win to test for: under a causal key nothing reads `global_seq_map`, so deleting the per-event sidecar makes this vanish. **This scenario must force that design decision.**

| **F26** | **A storage-wiped device rejects its own history and wedges** | **P0** |

*Setup:* Delete the SQLite file, keep `device_id` + token (Android reclaiming app data, or "clear app data to speed it up"). Restart, append 5 events, run a catch-up cycle plus a hub window replay.
*Assert:* Cursor advances past the first own-event page; the 5 new events reach the merged log; folds are non-empty and equal a refold of the branch window.
*Current:* All three fail, silently. Catch-up returns the device's own events, hits the "ingest of unknown own event" throw, `blocked=true`, cursor pinned forever. New events collide on lamport slots 0–4 and quarantine as `lamport_conflict`. Over LAN the throws are swallowed into `ingestBatch`'s `rejected` counter. **The device operates normally from the user's point of view while fully severed in both directions.**
*Causal:* Identical. Needs a distinct rehydration rule or a re-pairing flow that mints a new `device_id`.

| **F27** | **`push_ack` beyond own high-water crashes the process in a loop** | **P0** |

*Setup:* Device rewound (restore, `-wal` discard) to `ownHighWater()=240`; gateway acks 299. Real `createWsCloudTransport`. Five reconnect cycles.
*Assert:* No exception escapes the transport message handler; the process survives; the impossible ack surfaces as an operator-visible protocol-corruption condition while the POS keeps appending (01-F17).
*Current:* `advanceTo` throws `AckBeyondAppendedError` inside an unguarded `ws.on('message')` handler → uncaught exception kills the host. Restart replays the same ack. **Permanent crash loop that restarting cannot clear.**
*Causal:* Identical — untouched by the ordering proposal.

| **F28** | **Divergent duplicate exists only in process memory** | **P1** |

*Setup:* Deliver id X with different content in a catch-up page; read `status().quarantined`; SIGKILL; reopen; read again.
*Assert:* Written durably before `applyEvents` returns; still reachable after restart; cursor still advances (never wedges).
*Current:* `quarantined` is a plain in-memory array. The cursor deliberately passes it so it is never redelivered — after restart there is **zero durable evidence** two devices disagree under one id, against 01-F37's "stored verbatim / surfaced / origin notified".
*Causal:* Unchanged, but **strictly more important**: `causal_seq` enters `authoredContent()`, so every path that re-derives it for an existing id (crash retry, restore, relay) trips this same silently-forgotten quarantine.

| **F29** | **The quarantine notice must reach a WAN-less origin** | **P0** |

*Setup:* Real gateway. LAN-only W's event relayed upward by hub C; the cloud quarantines it; DEC-SYNC-008 keys notice delivery by origin device. Re-run with C dying between relay and notice and a new hub elected.
*Assert:* W receives the notice within a bounded number of hub heartbeats, across a hub change; W's honesty UI shows the event quarantined.
*Current:* The relay path does not exist — the gateway still enforces the superseded DEC-SYNC-004 rule. Notices go to the *pushing* session, so the origin never learns.
*Causal:* Identical. This is the acceptance test for T-01-12's notice half.

| **F30** | **The branch folds an event the cloud will never merge** | **P0** |

*Setup:* W's event propagates over LAN, all three devices fold it, 8 further events are appended on top of its order; the gateway quarantines it (DEC-SYNC-007 invariant violation). Run the nightly Auditor diff for 3 simulated days, then land the operator correction event.
*Assert:* After the correction, every device's fold === the cloud refold over the merged set; the nightly diff is **empty**; 01-F30 conservation holds on both planes; the correction sorts after every dependent event.
*Current:* The event lives at `+∞` on-device — at least visible as unsequenced. The Auditor diffs every night until the correction lands.
*Causal:* Peers have permanently advanced their causal clocks past a value with **no counterpart in the merged log** — a hole only the cloud can see — and the `+∞` visibility signal is gone. Device and Auditor refolds disagree *by construction* rather than transiently. A permanently non-empty Auditor is functionally no Auditor.

| **F31** | **Cloud-authored events have no ordering rule** | **P0** · RISK |

*Setup:* Inject a QR dine-in `order.created` (06-F17, persisted cloud-side, never pushed by a device) and a Foodpanda `order.created`+`order.confirmed` auto-confirm pair (08-F8) into the merged log; branch devices then append `line_added`, `confirmed`, `kot.printed`. Run three times under three `causal_seq` stamping policies: 0, org-max-at-merge, absent. Drive 200 aggregator orders interleaved with 200 dine-in to measure clock trajectory.
*Assert:* All three policies produce byte-identical fold state and all devices converge; two storefront orders 4 h apart order in merge order; `kot.printed` sorts after the `order.confirmed` it responds to; the counter's final `causal_seq` differs from an aggregator-free control by at most the events it actually observed.
*Current:* Works, expensively — one full rebuild per storefront/aggregator order on every device.
*Causal:* **Undefined, and the three answers are not equivalent.** 0 puts all cloud-authored history permanently ahead of the branch. Org-max means a busy Foodpanda night drags every branch clock forward and changes who wins later LWW races. Absent means the key is not total. **A policy must be named in DEC-PERF-001 before ratification.** Related: a single synthetic `device_id` makes `lamport_seq` non-contiguous per branch, breaking the gateway's per-origin contiguity and the Auditor gap check in every branch but the busiest.

| **F32** | **The delivery cursor cannot mean completeness** | **P0** · RISK |

*Setup:* 3-branch org. `global_seq` is allocated from an org-wide counter while fan-out and catch-up are branch-scoped, so a quiet branch's device sees 101, 102, 107, 108, 131… Then genuinely lose one seq in transit. Repeat with 01-F40 slice filtering, which holes it further per class. Separately: one branch's 5,000-event reconnect drain holding the single `org_sequences` row `FOR UPDATE`.
*Assert:* The device detects the genuinely lost seq within a bounded number of catch-up cycles AND never wedges on legitimate holes. `push_ack` p95 on the other branches stays within 2× control during the drain.
*Current:* `applyEvents` advances to the batch maximum with no contiguity demand — accepts any advance, so real loss is undetectable. Harmless today because `global_seq` still carries ordering.
*Causal:* Demotion makes this the **only** completeness signal a device has for cloud-delivered events (`causal_seq` is gappy by design, `lamport` is per-origin). Demanding contiguity wedges on the first cross-branch skip; accepting any advance can never detect loss. **If neither works, a per-branch delivery sequence distinct from the org merge sequence is required and the protocol must carry it.**

| **F33** | **The cloud loses its free ordering** | **P0** · RISK |

*Setup:* Testcontainers Postgres seeded with one org-month partition at 01-N4 volume. Run the Auditor refold-vs-readmodel diff folding (a) in `global_seq` order — physical insertion order, matching the one existing index — and (b) in `(causal_seq, device_id)` order. Measure query plan, sort spill, wall time. Then measure catch-up pages arriving uncorrelated with canonical order and the resulting below-tail rate on a device.
*Assert:* Auditor refold over an org-month completes within its nightly budget under the causal key; 01-N4 re-evaluated and still holds; catch-up-induced below-tail rate stays within the F70 measured bound.
*Current:* A sequential scan on an existing index. Cheap cloud ordering is a free consequence of `global_seq` being both storage order and canonical order.
*Causal:* Needs a sort or a new index, and cloud-side incremental maintenance inherits the device's out-of-order-insert problem. **25 §15's "retains its transport role; loses its ordering role" materially understates this**, and the cost scales with retention (forever), not with the rolling window.

---

# Batch 4 — Multi-device mesh & topology

Machinery: full `SimLan` mesh, hub election, partition/heal, plus a **contended-airtime transport model** (new — the current independent-per-message-delay model structurally cannot exhibit F37).

| **F34** | **Window replay is delivered device-blocked, not canonically ordered** | **P0** · **RISK** |

*Setup:* 3 origins interleaved across a morning to ~9,000 events, WAN cut. A fresh 4th device joins; `admitFollower → replayWindowTo` sends `readAllEvents()` as one `event_batch`. Count `rebuild()` on the joiner and measure join-to-converged.
*Assert:* `rebuild_count ≤ 2`; converged within the 01-N5 budget; folds byte-equal the hub's. **Report the count under BOTH keys — pass/fail alone is not the deliverable.**
*Current:* ~6,000 rebuilds (2/3 of N). `readAllEvents()` sorts by `(device_id, lamport_seq)`; at each origin-block boundary the key steps backwards and `rebuild()` resets `maxKey` to the global max, so every subsequent event of every later block also misses. **No clock skew and no cloud required.**
*Causal:* **NOT FIXED.** `causal_seq` interleaves across origins exactly as `device_created_at` does; device-blocked delivery still steps backwards at every boundary. 25 §13's "bounded by the delivery window" fails here because full-window replay makes the window the entire ledger. Needs canonical-order-on-the-wire *or* 25 §7 option B.

| **F35** | **Rejoin backlog is a genuine interior insert** | **P0** · **RISK** |

*Setup:* Three arms sharing one rig. (a) Waiter off the AP for 60 min at the rooftop, 180 events, rejoins at peak against a 7,000-event counter. (b) Both sides of a 45-min partition heal over LAN first, then over WAN 10 min later. (c) 20-min partition, 400 missed events healed in one `ingestBatch`, with a SIGKILL mid-transaction.
*Assert:* `rebuild()` bounded by out-of-order arrivals not batch size; heal commits < 2 s; no single transaction blocks the thread > 250 ms; after SIGKILL, re-heal converges and **durable progress is strictly monotone across kills**.
*Current:* One full rebuild per backlog event, all inside ONE transaction, so SQLite is write-locked and the POS UI hangs. (b) pays it **twice** — once on LAN heal, again as the same events return with `global_seq`. (c) a kill discards the whole heal, so if kills recur faster than the batch completes the follower makes zero forward progress and never rejoins.
*Causal:* (b)'s second storm disappears entirely. **(a) and (c) survive in COUNT** — the backlog is genuinely causally older under any stable key — dropping to O(k) only once entity-scoped recompute lands. This is the concrete case where 25 §13's bound needs 25 §7 option B to be true.

| **F36** | **Idle heartbeat re-fans the entire window** | **P0** |

*Setup:* Hub + 3 idle connected followers, 10,000-event window, 60 virtual seconds with zero business traffic. Count hub egress bytes, `readAllEvents()` calls, follower duplicate ingests, and rebuilds. Repeat at N=1,000 to test scaling.
*Assert:* Egress < 1 MB; `readAllEvents()` < 20; outbound envelopes per heartbeat per follower O(new events since last ack), not O(N); `readAllEvents()` per inbound push ≤ 1 (today: 3).
*Current:* `replayWindowTo` fires per follower per 2 s **unconditionally** — 90 full-window serializations and ~900,000 duplicate ingests per idle minute. **The trap: LAN duplicates carry no `global_seq`, so `recomputeFolds()` is 0 — the rebuild counter says everything is fine while this dominates any end-to-end T5 measurement.**
*Causal:* Unchanged. Stated explicitly so DEC-PERF-001 is not credited with it, and so T5 wall-clock numbers are not read before this is fixed or excluded.

| **F37** | **Contended radio: the re-fan starves the heartbeat that triggers the re-fan** | **P0** |

*Setup:* Replace independent per-message delay with a shared-airtime model (latency a nonlinear function of aggregate offered bytes, with a cliff), calibrated against one physical measurement on shop-grade 2.4 GHz. Hub + 4 followers, 10,000-event window, 2 s re-fan, with `availability.changed` injected every 30 s. 20–30 min run, no device leaving. Chained variant: five devices cold-booting onto a just-associated AP after power returns.
*Assert:* 01-F15 p95 < 1 s for operational events; **zero** hub re-elections attributable to airtime starvation; a stable hub within REELECTION_BUDGET_MS from an n-way cold start.
*Current:* The re-fan saturates airtime; ping/pong queues behind it; `HUB_LOSS_TIMEOUT_MS` (6 s) trips; the new hub replays the whole window to everyone, worsening contention. Self-reinforcing. **01 §8's spike exit criterion currently passes for a reason with no counterpart in production.**
*Causal:* Unchanged — the ordering key does not reduce bytes on the wire. The clearest case of the migration not fixing what people will assume it fixes.

| **F38** | **Reconnect interval shorter than window replay: catch-up that never terminates** | **P0** |

*Setup:* Sweep reconnect interval {0.5, 2, 6, 20, 60 s} × N {2k, 10k, 30k}, on the LAN path and the cloud paging path. Find the crossover per N under both keys.
*Assert:* **Pass criterion is TERMINATION, not milliseconds.** Every event authored during partition k is held within a bounded number of subsequent partitions; time-to-converge monotone in N rather than divergent.
*Current:* Below crossover the follower restarts replay before finishing and never converges, while the hub burns full-window scans every cycle. Silent — the device pongs and looks online with a stale kitchen queue. The crossover moves the wrong way as the day grows.
*Causal:* Per-cycle ingest cost collapses so the crossover moves out, but the O(window) transfer is untouched and non-termination remains reachable at larger N. **A constant factor on a liveness bug it cannot fix.**

| **F39** | **One-way LAN link → permanent single-node split-brain** | **P0** |

*Setup:* Wrap the kitchen's transport to swallow inbound messages from the hub only, leaving outbound and mDNS visibility intact. 30 s, then restore, then 60 s.
*Assert:* Within 30 s of restoration exactly one device reports `hub`, the others `follower` with that hub id; every event the kitchen appended during the window is present on both peers.
*Current:* K suspects C, re-elects itself, becomes a hub with zero followers. C drops K and stops sending to it entirely. **`suspects` clears only on inbound traffic from the suspect, which can never arrive — so it never heals, even after the link is restored.** Under the LAN-only-kitchen deployment every `kot.printed` and `→ready` is stranded on one device for the rest of service. Asymmetric Wi-Fi is far more common in restaurants than a clean partition, and it does not look like an outage to staff.
*Causal:* Identical — a membership/liveness defect wholly independent of the ordering key.

| **F40** | **Half-open socket and OS suspension: healthy-looking divergence** | **P0** |

*Setup:* Real-process leg. Arm A: a TCP proxy silently stops forwarding both directions with no RST/FIN. Arm B: SIGSTOP the follower so its timers freeze while the socket stays ESTABLISHED. Hold 20 min (~1,500 events), then SIGCONT and let the OS flush every buffered frame into one event-loop turn.
*Assert:* At minute 5 the follower's 01-F11 status must **not** report a healthy synced session — it must expose staleness measured in WALL time, not timer time; the hub drops it within the missed-limit; on flush nothing is lost or duplicated; report the flush burst's rebuild count.
*Current:* Under SIGSTOP no loss check ever runs. And `status()` exposes only queue depth / watermarks / `last_global_seq` — **no session-liveness or staleness field exists**, so the honesty UI structurally cannot report the drift. The flush is ~1,500 full rebuilds in a single event-loop turn.
*Causal:* Flush cost fixed; **the honesty gap completely untouched.** This is the failure mode that produces silent divergence rather than detected absence.

| **F41** | **Hub-relayed events must not be re-authored** | **P0** |

*Setup:* Real gateway. LAN-only K pushes 25 events (lamport 0–24) to hub C; C relays them in one cloud push with `device_id === 'K'`. Then give K a brief direct session and push the same 25.
*Assert:* All 25 rows carry `device_id === 'K'` and their original `lamport_seq` verbatim; `device_watermarks` has a row keyed (org, K) at 24 with C's own watermark untouched; contiguity is tracked **per origin** so a K gap does not stall C's push; K's later direct push dedupes via `sameContent` rather than `lamport_conflict`; quarantine notices for relayed events address K.
*Current:* All 25 quarantine as `device_mismatch`; no `global_seq` consumed; 25 notices delivered to the relay. The known launch blocker — this test pins the exact shape T-01-12 must produce.
*Causal:* Identical — uplink identity is orthogonal to the ordering key.

| **F42** | **A WAN-having non-hub cannot relay; the branch goes cloud-dark** | **P1** |

*Setup:* Branch WAN cut; only a manager phone (01-F39: never hub) has 4G. 400 events, of which M authors ~5. Quiesce, then heal WAN.
*Assert:* Checkpoint 1 forces the design decision — must a WAN-having non-hub-eligible device relay (a DEC-SYNC-009 amendment), or is the branch permitted to be cloud-dark? Checkpoint 2 (after heal) must contain all 400 exactly once with every fold equal.
*Current:* ~5 of 400 reach the cloud. Availability/DR gap, not a correctness one — **provided no device is lost during the window (see F43).**
*Causal:* Identical.

| **F43** | **A LAN-only second till is destroyed after a partition** | **P0** |

*Setup:* Main counter has WAN; the takeaway-window till is LAN-only *by design*. Cut branch WAN, partition the till + a waiter from the counter for 30 min; the till records 40 events incl. 12 `payment.recorded`; then destroy the till permanently. Heal both planes.
*Assert:* The merged log contains all 40 with `device_id` verbatim; folds equal; Σ payments equals the 12 takeaway sales.
*Current:* **12 recorded payments permanently lost.** DEC-SYNC-006 accepts the departed-origin hole *because the cloud path closes it* — but X7's origin had a cloud session and this one never did. Followers push own events only, so the events never cross over LAN either; they survive on one waiter tablet that 01-F14 retention does not even cover, until its window rolls.
*Causal:* Identical. **This is the concrete argument that DEC-SYNC-006's acceptance is only sound once T-01-12 lands — a coupling that is not currently written down.**

| **F44** | **Election is scoped by neither branch nor org** | **P0** |

*Setup:* One SimLan carrying two branches of one org (main + `prep_kitchen`, with the prep counter's `device_id` sorting lower) plus a second org's devices on the same SSID (food court / shared building). Run 2 h of service on both.
*Assert:* Every device elects a hub whose `branch_id` equals its own; `admitFollower` refuses a foreign `branch_id`/`org_id` and a bad token **before `replayWindowTo` runs**; no org-X event is ever transmitted to an org-Y device; cross-branch rejects are zero or classified separately in 01-F11.
*Current:* `electHub` is a pure function of `{device_id, device_class}` with no branch or org term, so a prep-kitchen counter can be elected hub for the main branch. Cross-branch envelopes are rejected at `ingestTx` and swallowed into `ingestBatch`'s silent `rejected` counter — the branch runs behind a hub that structurally cannot serve it, and under DEC-SYNC-009 its LAN-only devices are cloud-stranded through it. Worse: `admitFollower` calls `replayWindowTo` unconditionally, so **the entire branch window is transmitted before any identity check** — the LAN-side hole in the 01-F24 org-scoping law.
*Causal:* Identical.

| **F45** | **Revoking the elected hub while it is the only uplink** | **P0** |

*Setup:* The counter is hub *and* the branch's only WAN device, relaying for three LAN-only devices with 40 relayed events in flight. Revoke it mid-service (01-F25) over its own cloud session, so it learns before its peers do. 10 min.
*Assert:* Re-election within REELECTION_BUDGET_MS from the eligible set; every event authored before revocation reaches the merged log; post-revocation appends are refused **and surfaced**, never counted into `rejected`; pre-revocation events remain in every peer's fold (01-F1).
*Current:* Unspecified in both directions. `PeerInfo` carries no token or revocation term, so election keeps electing the revoked device. If it honours its own revocation, every LAN-only device's uplink dies with no election trigger — a live hub that refuses to work. If it does not, a revoked device keeps attesting others' events to the cloud.
*Causal:* Identical. One interaction: peers may bump causal clocks on relayed events the cloud later refuses.

| **F46** | **Revoke → purge → re-pair on a device that never stops selling** | **P0** · **RISK** |

*Setup:* A waiter tablet at branch position ~40,000 is revoked mid-service; the 01-F42 purge lands; it is re-paired 20 min later and resumes appending within 20 s of the wipe — **before backfill completes**. Two arms: same `device_id` retained; fresh `device_id` issued. Seed peers with its old events. Variant: purge arrives while it holds 120 unpushed events.
*Assert:* No duplicate `(device_id, lamport_seq)` **and no duplicate `(device_id, causal_seq)`** anywhere in the branch; its first post-repair event sorts after every event the branch already holds; refusals are surfaced to 01-F11/15-F14, never swallowed; unpushed events either drain before the wipe or the loss is enumerated.
*Current:* Lamport restarts at 0 and every reused slot throws at peers, swallowed into `rejected` — the device operates normally while silently refused branch-wide.
*Causal:* **Strictly worse and unrecoverable.** If `causal_seq` seeds from the device's own store it restarts at 0, so every event it authors thereafter sorts to the absolute front of canonical order **forever** — a Lamport clock only bumps on what it observes, and 01-F42 says scoped devices cold-start from slice backfill only. **Whether the backfill seeds the clock is the load-bearing unnamed decision**, and the three events appended before backfill completes carry 0 regardless.

| **F47** | **Load-shedding: whole branch dies, battery tablets keep selling, network returns last** | **P0** |

*Setup:* Mains counter + mains kitchen (no battery) + router SIGKILLed at t=0; two battery waiter tablets keep appending for 12–25 min against a 6,000-event window. Restore mains but hold the AP down 40 s, so **every hub-eligible device completes `refoldTx()` with an empty peer set**. Then associate the AP. Repeat 30 s later (generator switchover). Brownout variant: SIGKILL the counter four times at 25 s intervals mid-`ingestBatchTx`.
*Assert:* Exactly one hub within REELECTION_BUDGET_MS from the n-way self-elected start, both times; nothing lost or duplicated; all folds equal a canonical replay of the union; rebuilds attributable to **local append** are exactly 0; **held-event count is monotonically non-decreasing across the brownout kills**; time-to-first-usable-handle at N ∈ {1k, 10k, 30k} against the 02-N1 6 s budget.
*Current:* Two simultaneous full refolds on the slowest hardware; both self-elect (`electHub([self]) → self`), giving n-way split-brain rather than the tested 1-vs-1 flap; the battery devices' backlog then rebuilds once per event. Under brownout the counter can be killed again before finishing work it already repeated — net progress near zero. **Twice a day, every day, in the target market, and there is no scenario for it.**
*Causal:* Cold-start refold and self-election **unchanged** — the proposal does not help the slowest part. Post-restore appends never rebuild regardless of RTC state; the merge residual is bounded by the delivery burst.

| **F48** | **A clock step breaks hub-loss detection in both directions** | **P0** |

*Setup:* Star mesh through the injectable Clock. Arm A: step a follower back 40 min right after a ping, then SIGKILL the hub; measure time-to-new-hub. Arm B: step it forward 10 h with the hub pinging healthily.
*Assert:* A: new hub connected within REELECTION_BUDGET_MS of **elapsed** time regardless of any step. B: no `onHubLoss`, `suspects` stays empty, for a forward step of any magnitude.
*Current:* A: `idle` evaluates negative, so the check reschedules ~2,400 s out — a dead hub undetected for 40 minutes, 01-F13 missed by ~240×. B: `idle` is instantly past the timeout, so a healthy hub is suspected and excluded; suspicion clears on inbound traffic, so expect a re-election flap (duration should be measured, not assumed) that still drops the follower's LAN feed mid-rush.
*Causal:* **Unchanged — the liveness path reads `clock.now()` directly and survives DEC-PERF-001 entirely.** The fix is a monotonic elapsed-time source, independent of the ordering decision.

| **F49** | **A waiter/manager island elects no hub; and hub flap under reboots** | **P1** |

*Setup:* (a) Partition three waiters + a manager onto a second AP for 20 min; they keep taking orders. (b) Windows Update / failing UPS: stop and restart the counter's session twice in five minutes on the same on-disk store at N=6,000.
*Assert:* (a) every islanded device reports `hub_id === null` and `follower`, never `candidate`/`hub`, and 01-F11 surfaces "no hub reachable" as a condition distinct from healthy. (b) exactly one hub after each flap within budget; nothing lost; **envelopes serialized by the counter bounded by new-events-since-last-ack, not O(N × followers × flaps)**; counter rebuilds ≤ 3.
*Current:* (a) correct per 01-F39 but the orders reach neither each other nor the kitchen for 20 min, and `hub_id === null` is the only signal and is not surfaced. (b) ~36,000 envelope serializations across two flaps plus a brief two-hub window on return (`stop()` clears `visible`, so the counter restarts as `solo`).
*Causal:* Election behaviour identical; heal-side rebuild count unchanged, dropping to O(k) only with option B.

| **F51** | **Sehri: the day boundary lands mid-service** | **P1** |

*Setup:* 02:00–04:30 Asia/Karachi service, 60 open orders, four devices appending. Run the 01 §5 compaction and the 01-F14 window roll at the boundary. One device partitioned across it rejoins at 03:10. Include a settled order whose `payment.recorded` is prunable and is refunded the next afternoon, and the 15-F21 forced-update window (which defaults to exactly these hours).
*Assert:* No event referenced by an open entity is pruned; every device agrees which business day each order belongs to; 01-F30 holds across the boundary; the rejoiner converges with zero permanently-parked events; **a `payment.refunded` can never park on a pruned `payment.recorded`**; no forced update applies while orders are open; **the prune predicate provably does not read `device_created_at` from any envelope**.
*Current:* No compaction code exists anywhere. `FoldEngine` exposes only `apply` and `rebuild`, so any prune must be followed by a full rebuild. Every day-boundary assumption in the corpus places the boundary when the restaurant is closed.
*Causal:* Compaction is orthogonal — **except that under the proposal the device's own event rows are the durable source of the causal clock, so pruning the highest row regresses it** (see F52). The refund-orphan and no-incremental-removal problems belong to compaction and must be designed before it is written.

---

# Batch 5 — Crash & durability (child-process rig, real SIGKILL, real files)

| **F52** | **Where the causal clock is recovered from** | **P0** · **RISK** |

*Setup:* Append 200 own events, ingest 50 peer events (max `causal_seq` 2,000), then append one `audit.drawer_opened` **last** (fold-inert, filtered out of `readAllInputs`). SIGKILL. Reopen, append. Test three recovery implementations: (a) MAX over `events` only; (b) the engine's live `maxKey`; (c) MAX over `events ∪ peer_events` incl. audit rows, or a dedicated persisted counter row. Second arm: the same after a compaction pass empties the ledger entirely (a spare tablet unused for two weeks).
*Assert:* The next appended event's `causal_seq` is strictly greater than **every** row in `events ∪ peer_events` including audit rows; `apply()` fast-paths (0 rebuilds) over the following 20 appends; strictly greater than every value the device ever issued, even when the ledger it was derived from has been pruned to empty.
*Current:* `lamport_seq` recovers as `MAX FROM events`, which is correct by definition (per-device, own-only). Clean.
*Causal:* (a) misses peer rows; (b) misses **both** audit and peer rows because `readAllInputs()` filters `isAuditEvent`. Both re-issue a value at or below events already applied — every subsequent append rebuilds **and** Lamport property 3 is violated, with **no clock-skew health flag able to detect it because no clock is involved**. After compaction, a ledger-derived clock restarts near 0 and every new event sorts to the front of the branch order. **Forces the design: `causal_seq` must live in a dedicated persisted counter row that compaction never touches.**

| **F53** | **Crash retry must reproduce the STORED `causal_seq`** | **P0** · **RISK** |

*Setup:* Append event X (commits with `causal_seq` S); kill before the host records success; reopen; ingest 500 peer events so the clock is at S+500; replay the host's durable pending-action journal with byte-identical input and the same id. Repeat for an `audit.reprint` (whose `prev_audit_hash` is also store-stamped).
*Assert:* Returns the stored envelope and throws nothing; returned `causal_seq`, `lamport_seq` and `prev_audit_hash` equal the originally stored values; `authoredContent()` matches the stored row.
*Current:* Passes — `appendTx` pins `lamport_seq`/`server_received_at` from the stored envelope and re-stamps `prev_audit_hash` from `storedPrev`.
*Causal:* If `causal_seq` is not added to the pinned-from-stored list, the retry is stamped with the *current* clock, `canonical(retry) !== canonical(stored)`, and `appendTx` throws "divergent content" — **the host treats a durably-recorded, already-pushed payment as a failure.** Worse on ingest: `causal_seq` is inside `authoredContent()`, so any device holding both forms raises `DivergentDuplicateError` for a legitimate crash retry.

| **F54** | **SIGKILL between the clock bump and the insert** | **P0** · **RISK** |

*Setup:* Child-process harness, 200 seeded kill points biased into the window between the counter write and `insertEvent.run`. After each: reopen, record the full row set, resume. Also build a second store from the same event set in reverse arrival order.
*Assert:* No two rows share `(device_id, causal_seq)`; after each reopen the three fold tables are byte-identical to an explicit `refold()`; the reverse-order store produces byte-identical rows.
*Current:* Lamport assignment and insert are in one transaction under `synchronous=FULL` — commit or rollback, no torn state. Already covered and green.
*Causal:* Depends entirely on whether the bump is in the same transaction. A *burned* value is a harmless gap (§13 allows gappiness); a **reused** value is fatal — `byCanonicalOrder` returns 0, so `apply()`'s `< 0` guard fast-paths it while `rebuild()`'s stable sort orders the pair by unordered SQL row emission. **Incremental and rebuilt state then differ, and §13 property 1 silently stops holding with no error anywhere.**

| **F55** | **Two handles on one store file — the shipped Electron topology** | **P0** · **RISK** |

*Setup:* Open two `DeviceStore` handles on the same path (Electron main + renderer, or app + background print/sync worker, or a recovery tool alongside the live app — `openStore` takes a path and nothing prevents it; the code already anticipates a second handle where it re-reads the audit HEAD). 1,000 seeded concurrent append interleavings holding the read-then-write window open. `db.transaction` is DEFERRED, so `MAX(x)+1` is textbook write-skew.
*Assert:* Zero duplicate `(device_id, lamport_seq)` commits and every collision surfaces as a thrown error; `SQLITE_BUSY_SNAPSHOT` surfaces loudly, never a silent retry re-reading a stale max. **The identical assertion for `(device_id, causal_seq)`.**
*Current:* `UNIQUE(device_id, lamport_seq)` converts the skew into a loud `SQLITE_CONSTRAINT`. Sound.
*Causal:* §13 claim 1 ("unique within a device") holds only under a single writer, and **no UNIQUE is proposed for `causal_seq`**. Two events from one device can share a key — a real tie under a key with no third term, from an ordinary deployment topology, with no schema constraint to make it loud. **This defeats claim 1 at the source rather than in transit**, and two honest peers then diverge permanently.

| **F56** | **A `-wal`-less file copy rewinds the ledger and the clock** | **P1** |

*Setup:* Copy only the main `.db` (technician diagnostics, or an Android app-data backup capturing the primary file) and open the copy.
*Assert:* No store anywhere ever holds two distinct ids sharing `(causal_seq, device_id)`; re-issued events are rejected by peers and quarantined `lamport_conflict` rather than silently merged; the device surfaces a durable divergence signal; the outbox does not wedge (DEC-SYNC-005).
*Current:* Everything past the last checkpoint is gone; `ownHighWater()` rewinds and reused slots are loudly rejected everywhere — divergent on-device, loud at every receiver.
*Causal:* Same lamport rewind, with causal reuse riding behind it. **The scenario's job is to prove the causal reuse cannot escape that shield** — a `(causal_seq, device_id)` tie returns 0, which `apply()` treats as in-order while `rebuild()` orders it by unordered row emission.

| **F57** | **Partial catch-up page, and a kill between the write and the cursor advance** | **P1** |

*Setup:* SIGKILL at 20 seeded points inside a 500-event page, and specifically between `ingestBatchTx` commit and `setLastGlobalSeq`. Resume, quiesce.
*Assert:* Fold state byte-identical to `refold()` and to an uninterrupted control; every event delivered in the page is present (including those after a `blocked` event); resumed-page rebuild count ≤ the control's; **the recovered `causal_seq` equals what it would have been without the crash (idempotent under replay)**.
*Current:* Safe direction — events durable, cursor behind; re-delivery is cheap dedupe. The crash adds one refold per restart, not a doubled storm.
*Causal:* The re-ingested page must **not** re-bump the clock (or every crash-retry inflates the device's counter and it wins races it should lose) — but a bump skipped on dedupe is a bump lost across the crash. **The two requirements are in tension and no rule exists.** See F61.

| **F58** | **Reconnect storm × uncheckpointable WAL × nearly-full disk** | **P0** |

*Setup:* Free space capped at a realistic cheap-tablet margin. End an offline day at 10,000 unsequenced events (or 30,000 for a three-day ISP outage), reconnect, sequence all of them origin-inclusive, and force a restart mid-recovery. Kill at three randomized points inside the adoption loop.
*Assert:* Reconnect completes without `SQLITE_FULL`; peak additional disk within a declared bound; no write transaction blocks the thread > 250 ms; total fold CPU < 60 s (25 §11) with `openOrders()` reads at p95 < 200 ms throughout; forced `SQLITE_FULL` fails LOUD and is evaluated against 01-F17/01-F2.
*Current:* Two individually-survivable conditions compose into non-convergence. 10,000 unconditional rebuilds each rewriting every fold row, WAL unable to checkpoint, ~100 % event-loop duty cycle (**which is itself what makes the ANR/watchdog kill likely — the crash is caused by the defect, not coincident with it**). Restart re-runs `refoldTx()` against a disk that is already full, so the terminal cannot open. At 30,000 the 2.14 exponent gives ~98 min on a laptop, 8–16 h on a tablet.
*Causal:* Adoption is a cursor advance; no long write transaction exists for a kill to land inside and no storm to resume. Fold work is the fast-path applies already paid during the outage.

---

# Batch 6 — Pre-ratification gates specific to the causal design

**Every entry in this batch is a risk to DEC-PERF-001 and is repeated in the risk section below.** These must run before ratification, not after.

| **F59** | **Cold-start seeding: backfill, not own events** | **P0** · **RISK** |
| **F60** | **Slice deflation: the waiter loses every race because it is allowed to see less** | **P0** · **RISK** |
| **F61** | **Bump-on-dedupe: clock inflation vs. an fsync workload that did not exist** | **P0** · **RISK** |
| **F62** | **`causal_seq` is unbounded, unverifiable, and forgeable** | **P0** · **RISK** |
| **F63** | **Non-communicating sets: `causal_seq` has no meaning across branches** | **P0** · **RISK** |
| **F64** | **Rank and wall-clock value decouple → negative kitchen ages** | **P0** · **RISK** |
| **F65** | **Entity-scoped recompute has no index, and branch-global events have no entity** | **P0** · **RISK** |
| **F66** | **Wire and schema compatibility during rollout** | **P0** · **RISK** |
| **F67** | **The audit hash chain and the one-way rollback door** | **P0** · **RISK** |
| **F68** | **Mixed-comparator fleet, era-0 defaults, and a two-era Auditor** | **P0** · **RISK** |

Full entries are in the risk section — they are the most valuable in the catalog and are not buried here.

---

# Batch 7 — Evidence and methodology gates

| **F69** | **Ablation: what three lines actually buy** | **P0** |

*Setup:* One fixture set, four arms, same seed, same machine: status quo; +A (skip no-op adoptions); +A+B (entity-scoped recompute); +A+B+C (batch per page). Profiles: 25 §3 B1 (T5 adoption storm) and B2 (skewed offline appends). Integer counters, not stopwatch.
*Assert:* Publish the four-arm table **before DEC-PERF-001 is ratified.** The decision-relevant integer is B2's rebuild count under A+B+C.
*Rationale:* 25 §3 records that all 10,000 B1 rebuilds were provable no-ops, so A alone should take the reconnect storm to near-zero — and §7A states explicitly that A does nothing for B2, where fold state genuinely changes. If B2 survives A+B+C at O(N), the structural change is justified on evidence; if it falls, a one-way-door decision (25 §15: cheap now, expensive after pilot) is not warranted. **"Quadratic, therefore migrate" without "here is what three lines buys and exactly what it does not" is an incomplete basis.**

| **F70** | **Leg parity and the one unbounded term** | **P0** |

*Setup:* One identical event set and fault schedule through **both** DEC-TEST-002 binding legs. Diff fold state, rebuild counts, parked-list evolution. Then characterize the real transport explicitly: does a reconnecting WebSocket preserve per-sender FIFO where SimLan does? Does a window replay arrive atomically or interleaved with live frames? Measure the **maximum positions an event moves relative to send order**, and the below-tail arrival rate and depth under a 4-device rush.
*Assert:* Both legs identical; **the sim's configured reordering window ≥ the measured real one — a narrower sim window is a FAIL**; the measured residual recompute cost fits the 25 §16 O(k) budget on the REAL leg.
*Rationale:* 25 §13's entire residual-risk claim is that out-of-order inserts are "bounded by the delivery window" — and the delivery window is a property of the real transport. If the sim is optimistic, **both binding gates go green while the one unbounded term in the analysis is never touched**, and 19 §6 reads the Ditto exit ramp off exactly that combined gate. Until this number exists, §16's figure stays labelled a projection, per §16's own warning.

| **F71** | **Sizing the real ledger: the benchmark N is an order-event N** | **P0** |

*Setup:* Two fixtures both labelled "one business day, 1,000 orders": (a) the 25 §3 fixture — 10,000 dependency-free `order.created`, nothing ever parks; (b) realistic dependency chains **plus** the branch-global stream at rush rates (`availability.changed` dozens a night, `shift.*`, `day.*`, `cash.drawer_opened` per cash sale, `stock.*`, `table.state_changed`, `printer.status_changed`, `staff.clocked_in`). Report `readAllInputs()` row count, peak parked length, drain iterations, total fold work.
*Assert:* **Every budget in 25 §3/§11/§16 is restated against realN. Any published figure still citing the order-only N fails the gate.**
*Rationale:* The fold engine consumes 8 types of the ~90 in the 01 §4 catalog, but `readAllInputs()` reads and parses **every** row of both tables before filtering — so rebuild cost scales with the full ledger while the fold consumes a fraction. That multiplier is absent from every published number.

| **F72** | **Runtime parity: the benchmarked store cannot run on four of six device classes** | **P0** |

*Setup:* `device-store.ts` hard-imports better-sqlite3 (synchronous Node addon), so the shipped store runs only under Electron — `counter_electron` alone. `counter_rn`, `kitchen`, `waiter`, `manager` are RN/Hermes hosts with **no storage path in this repo**. But `folds/replay.ts` is pure TS on `@restos/domain` and can be driven under Hermes today. Run `createFoldEngine` over the same 10,000-event fixture on Hermes and V8 under both comparators.
*Assert:* T5 fold within the 25 §11 60 s budget with **no OOM under the default Hermes heap ceiling**; ≤ 250 MB steady-state and ≤ 4 s cold start for the waiter class (04-N1/04-N2). Report the measured Electron:Hermes ratio against the assumed flat 5–10×.
*Rationale:* 25 §3 attributes its super-quadratic drift to GC pressure — **the one measured effect that is runtime-specific is the one being extrapolated across runtimes.** An OOM kill is a different failure class from a slow fold, with different recovery semantics, and the crash family already assumes OOM kills as an *input* without ever asking what causes them. The causal order's whole effect is that the transient rebuild allocation stops happening, which makes it **more** load-bearing on Hermes than on V8 — an argument in its favour nobody has measured.

| **F73** | **Seeded chaos to quiescence, plus exhaustive small-scale interleaving** | **P0** |

*Setup:* (a) Generative: seeded random schedules over the sim mesh — random partitions/heals, hub kills, duplicated and dropped frames, process restarts, WAN cuts — 10,000 virtual seconds over 5 devices, to quiescence. (b) Exhaustive: 3 devices, ~8 events, **every** delivery order enumerated, not sampled. Print the seed / permutation index on failure.
*Assert:* Every device's fold === a clean canonical replay of its OWN set; every pair holding the same set is byte-identical; nothing lost or duplicated; 01-F30 conservation per order. Every failing seed is promoted to a named regression scenario.
*Rationale:* 20 §2.3 property testing exists but is applied to **folds** — pure functions over an event set — never to the protocol; partitions, elections, reconnects, crashes, loss and duplication are all hand-scripted, so they find only the failures their author imagined. 01-N1 claims determinism under "any received order"; the corpus verifies a few dozen author-chosen orders. **This matters more under the causal key**, where the residual risk moves entirely into LAN delivery reordering — exactly the space a generative schedule explores.

| **F74** | **Order-sensitive fold field registry across all six folds** | **P0** |

*Setup:* Machine-check an enumeration of every order-sensitive field across FOLDS.md's **six** declared folds — `replay.ts` implements two. Classify each: first-wins (`confirmed_at`, `kot_at`, create identity, duplicate `line_id`), last-wins (`assigned_table_id`), accumulate (`pay_total`, `refund_total`), state-machine (line state + anomalies). One old-vs-new comparator equivalence case per field. First-class coverage for the three unimplemented folds. Specifically: partition the branch and have the pass toggle `availability.changed{karahi, false}` while the manager toggles it `true`, WAN down; and race `order.table_assigned` against `table.state_changed` for one physical table.
*Assert:* An order-sensitive field with no paired equivalence case **fails the build**. `table_state` and `open_orders` agree on every table's occupancy. The availability winner is the later real-time toggle and **does not change when a device's clock is set 3 years ahead**. Both orders stand with a conflict badge per 01-F19.
*Rationale:* The comparator is validated against 2 of 6 folds and then inherited by the rest as they land. FOLDS.md's stated rule — "LWW entities tiebreak on cloud `global_seq`" — and DEC-PERF-001's carve-out ("01-F18 unaffected, cloud-plane, server time trustworthy") **both provably fail for `availability`**, which is operational, propagated fast-path with WAN down, and therefore has neither `server_received_at` nor `global_seq`. It also has no parent, so it never parks and never scopes — 25 §7 option B cannot help the event type that fires most during rush. One physical table currently has two independent LWW surfaces racing to decide its occupancy.

| **F75** | **The convergence contract when sets differ permanently** | **P0** |

*Setup:* Four participants quiesced with permanently unequal sets **by design**: a full-window counter; a counter past the compaction boundary; a waiter on a real 01-F40 slice; and the cloud merged log, which excludes an event the origin already folded (01-F37 contemplates this explicitly). Add a purged-and-re-paired device. Separately: three devices each missing a *different* origin's event, each settling the same order from its own screen; and a device missing one `payment.recorded` taking a second payment for money already collected.
*Assert:* Write the contract as an executable predicate — over the intersection of any two devices' sets the folds must be byte-identical; every permitted difference outside the intersection must be **nameable by a specific component** (device honesty UI, hub, gateway, or Auditor). **A permitted difference no component can observe is a FAIL.** Before a human acts, a device must detect its own per-origin lamport hole and expose a completeness/provisional marker on money-touching read models. The Auditor's device-state diff must be evaluated over each device's *entitled slice* and produce zero diffs for healthy scoped and post-compaction devices.
*Current:* Nothing asks this. 01-F34's guarantee and 25 §13 claim 2 are both statements about **sorting the same set** — vacuous when sets differ by construction. The device has the raw material (`UNIQUE(device_id, lamport_seq)` + 01-F3 gap-freedom) but nothing computes per-origin contiguity device-side; only the gateway does. DEC-TEST-003 defers device-state diff. A healthy scoped waiter produces an Auditor diff every night forever — which is how audit alarms get muted.
*Causal:* Identical, and **detection gets strictly worse**: `causal_seq` is gappy by design so it carries no completeness signal, and demoting `global_seq` removes the weak `+∞` "not yet ordered" signal. The fold becomes confidently wrong rather than visibly provisional. A Lamport scalar is not a vector clock.

| **F76** | **Money idempotency: the double-tap with a REGENERATED event id** | **P0** |

*Setup:* Two arms, both with a fresh envelope id and the **same `settlement_attempt_id`**: (a) cashier double-taps a laggy tablet; (b) SIGKILL between the append and the UI ack, restart, retry. Repeat for `payment.refunded`, and add a cross-device double refund (waiter and counter both refund the same payment, different attempt ids) combined with 01-F29's remainder check.
*Assert:* Two `payment.recorded` sharing a `settlement_attempt_id` contribute to `pay_total` exactly once, via every path (append, LAN ingest, hub relay, cloud fan-out). `refund_total ≤ pay_total` holds in fold state. 01-F30 conservation holds. The duplicate is retained and flagged, never silently absorbed. The event the gateway quarantines is the one the device fold ranks canonically second.
*Current:* **`settlement_attempt_id` is declared in `registry.ts` with the comment "01-F31: double-taps cannot double-record" and is read by NO fold and NO dedupe path** — verified: the only reads are schema parsing and a registry test. `replay.ts` does a bare `acc.pay_total += p.amount_paisa` keyed on nothing, and the only dedupe anywhere is by event id. So idempotency holds for transport duplicates and same-id retries and **fails completely for exactly the case the FR was written for.** Likewise `acc.refund_total += p.amount_paisa` with no bound — 01-F29 says the remainder cap is "fold-enforced" and the fold does not enforce it. **The existing crash-retry coverage reuses the same id, so it validates the covered half and leaves the uncovered half looking tested.**
*Causal:* **Strictly worse.** The retry gets a new `causal_seq` at the current max, sorts at the tail, fast-paths, and both payments accumulate with no rebuild and no anomaly — even the incidental signal that something reordered disappears.

| **F77** | **Whether a manager's approval applies is decided by the comparator** | **P0** |

*Setup:* Requires `approval.requested/granted/denied` in the registry and an approval fold — **grep confirms no `approval.*` handling exists anywhere in `packages/` or `services/`**, and 01-F36 is deferred out of Wave 0. A refund on order O requires manager approval (01-F29: always). The approver is a manager-class device — full slice, never hub, a personal phone on 4G, so its events arrive over a different path with a causal clock bumped by an unrelated observation set. Enumerate all delivery orders of {request, grant, the refund, a competing deny, the terminal settle}, plus the 05-F8 arm where the 30 s timeout fires and the local manager-PIN path proceeds.
*Assert:* In every order the refund ends in exactly one of {approved-by-remote, approved-by-local-PIN} and **never "unapproved but applied"**; no double approval; the sale is never blocked (01-F17/05-F8); 01-F30 holds; a stale response is a logged no-op that is **visible and counted**, never silent. The outcome must be identical under both comparators.
*Rationale:* "Pending" is not a wall-clock judgement — it is a question about where the response sorts relative to its request and to any terminal transition, **so the comparator already decides which approvals are live.** A reorder that ranks the grant below its request converts an approved refund into an unapproved one, and 01-F36's own rule makes that a *logged no-op* — **it fails silently by specification.** The highest-value fraud path in the product resolves on ordering semantics no test exercises and no code implements.

| **F78** | **Branch-time offset must be an integer-millisecond quantity** | **P1** |

*Setup:* Implement DEC-TIME-001(b) the textbook NTP way — offset `((t1−t0)+(t2−t3))/2` — with round-trip asymmetry making the sum odd. Append one `order.created` with the resulting stamp.
*Assert:* No code path can produce a non-integer `device_created_at`; `store.append` never throws for a clock-derived reason.
*Current:* `device_created_at: z.number().int()` rejects it, the throw is inside `appendTx` so the transaction rolls back and `append` throws to the caller — **nothing persists and the UI can never confirm, breaching 01-F17 and 01-F2.** It fires only when the offset halves to a fraction, so it presents in the field as a random, latency-correlated POS failure during rush.
*Causal:* Identical — 25 §14 still requires a time layer producing `device_created_at`. **Same defect class as DEC-MONEY-005: division is where floats enter.** The branch offset needs a stated integer-millisecond rounding rule exactly as money rates do.

---

# Risks to the proposed design

These are cases where `(causal_seq, device_id)` performs **worse than, or no better than, the status quo**, or where the proposal's own correctness argument does not hold. They are the decision-relevant entries and none should be deferred behind the performance batches.

### A. Cases the causal order does NOT fix (the budget claim is at risk)

**F34 — Device-blocked window replay.** `readAllEvents()` sorts by `(device_id, lamport_seq)`, so every origin-block boundary steps the key backwards. `causal_seq` interleaves across origins exactly as `device_created_at` does, so the miss count is **essentially unchanged (~2/3 of the batch)**. 25 §13's "bounded by the delivery window" is false here because full-window replay makes the window the whole ledger. Requires canonical-order-on-the-wire or option B.

**F35 — Rejoin backlog and partition heal (LAN leg).** A returning device's backlog is genuinely causally older under **any** stable key. Guard-miss count identical; only the per-miss cost changes, and only if option B ships.

**F22 — Park-and-drain.** `causal_seq(parent) < causal_seq(child)` is precisely what Lamport guarantees, so a late parent always sorts below its parked child. **Identical failure, 300 rebuilds under both keys.** The kernel's two out-of-order tolerance mechanisms cannot both be on the cheap path.

**F19 arm B / F20 — Concurrent-append ties.** Genuinely concurrent events tie under any total order; the `device_id` loser still misses. The causal win is in *adoption* and *causal chains*, not here. **If the causal arm's miss rate in F19 arm A is not materially better, 25 §16's budget projection is invalid.**

**F65 — Option B has no index and no `k`.** The complement the whole O(N) budget rests on. `events` is `(id, lamport_seq, envelope)`; `peer_events` is `(id, device_id, lamport_seq, envelope)`; `order_id` exists only inside the JSON text and **there is no `CREATE INDEX` anywhere in `packages/sync-client`** — so scoping one order costs a full scan plus a parse of every row: O(N), three orders of magnitude over the assumed O(k≈10). And `availability.changed`, `shift.*`, `day.*`, `cash.*`, `table.state_changed`, `printer.status_changed` are **branch-global — there is no entity to scope to**, so option B degrades to a full rebuild on exactly the highest-frequency rush events. *Assert:* every fold-consumed type has a declared scope key (machine-checked); rows-read per recompute bounded by a constant independent of N for every type in the realistic mix. Price the index write on every append/ingest under `synchronous=FULL` in both directions.

**F36 / F37 / F38 — Mesh protocol costs.** Full-window re-fan, airtime saturation and the reconnect/replay crossover are protocol properties. Unchanged. **Ratifying DEC-PERF-001 must not be read as closing 01 §8's LAN p95 exit criterion.**

**F07 — Residency, with a specific inversion.** `rebuild()` assigns **fresh** `orders`, `appliedPayments` and `parked` Maps and is currently the only thing that ever resets them. **Removing rebuilds removes the accidental garbage collector**, so the proposal makes unbounded residency strictly worse and must ship with an explicit prune.

**F58 / F09 / F51 — Cold start and open-time refold.** `refoldTx()` on open is untouched. If cold start alone breaches 02-N1 at N=10,000, the ordering fix is necessary but not sufficient and a snapshot/checkpoint (25 §7 option F) is also required.

### B. Cases where the causal order is actively WORSE

**F59 — Cold-start / replacement seeding.** *Setup:* A replacement device cold-starts from a hub-eligible peer's full branch window (01-F14, 01-N5), ingesting ~4,000 events whose max `causal_seq` is M, with an **empty own-events table**. Append. Repeat with a SIGKILL mid-backfill. *Assert:* the first appended event carries `causal_seq > M`, fast-paths (0 rebuilds), and its `table_assigned` wins over every backfilled assignment — and the same holds after the kill, proving the counter derives from durable state rather than an in-memory accumulator. *Risk:* If seeded as `max(own events)+1`, an empty table gives 1, so **every append sorts below the entire backfilled ledger** — the skew pathology, self-inflicted — and, far worse semantically, a brand-new real table assignment **loses last-writer-wins to a two-day-old stale one**. Today a replacement with a correct clock naturally stamps above the backfill and fast-paths.

**F103-class — Local per-device backfill cannot converge.** *Setup:* Run the proposed local backfill (assign `causal_seq` by rank in the device's own canonical order) on three devices holding legitimately unequal subsets: a full-window counter, a midday-cold-started kitchen tablet with a shorter window, and a waiter on the 01-F40 slice. *Assert:* for every event held by more than one device, the assigned `causal_seq` is identical. *Risk:* **Rank-in-my-set is not subset-independent** — an event 47th in the counter's set is 12th in the waiter's — so three devices stamp three different values on the same immutable event, breaking the exact property §13 relies on ("a pure function of the event's own immutable fields"), permanently, because `causal_seq` is never revised. A cold-started device is a fourth answer again. **The only sound forms are a single cloud-side assignment fanned out, or a function of immutable per-event fields alone — and the unsequenced pre-migration tail has no such function available.** The escape hatch this repo actually has: Wave 0 has no production data, so **assert the decision to discard the ledger rather than inherit a backfill by default.**

**F60 — Slice deflation makes ordering authority a function of permission.** *Setup:* 4 devices over a 3-hour service; the waiter is on a **real** hub-enforced 01-F40 slice (own-table orders, availability, own events — payment/cash/shift and other waiters' detail excluded per 04-F17), observing ~15 % of branch traffic. Thirty physically-symmetric concurrent `order.table_assigned` races against the counter. Also record every observed-then-authored pair. *Assert:* winner distribution within [0.3, 0.7] per device; zero violations of `causal_seq(A) < causal_seq(B)` for observed-then-authored pairs. *Risk:* A Lamport clock only bumps on what it observes, so **the waiter's clock is structurally and permanently deflated and it loses essentially all 30 races — not because it acted later but because it is permitted to see less.** Direction-consistent, unfixable on-device, and 04-F4 also bars it from ever being the reference hub. Under the current key the winner is roughly a coin flip. **Related (rider, 09-F2): the rider never joins the branch LAN and its slice excludes most branch events, so §13 claim 3 — "if A happened-before B then causal_seq(A) < causal_seq(B)" — is provably FALSE for concurrent-but-later pairs. The design's core correctness argument silently assumes total observation. The test must record which of the six 01-F39 classes the key is provably causal for.** Add the 01-F41 section-reassignment arm: a targeted backfill burst jumps the clock discontinuously, so the same physical action wins or loses purely on whether it landed before or after an administrative event with no causal relation to it.

**F61 — Bump-on-dedupe: inflation on one side, an fsync workload on the other.** *Setup:* Hub + follower, 10,000-event window. The 2 s `replayWindowTo` re-fan means a follower observes thousands of mostly-duplicate events per second, and **today a duplicate costs one indexed SELECT and returns `{stored:false}` with ZERO writes.** Arm (a): persist a bump per receive under `synchronous=FULL`. Arm (b): batch bumps, then SIGKILL mid-batch. Also drive 30 full-window re-fans of an unchanged window and then a contested `table_assigned`. *Assert:* after 30 re-fans the next appended event's `causal_seq` is exactly one greater than after the first ingest, and the later-acting device wins; **and** there exists a setting where the post-SIGKILL recovered clock ≥ every value ever emitted or observed **while** sustained fsync rate stays within the eMMC write budget. *Risk:* §13 says "bumped on receipt of any peer or cloud event," which a literal implementation applies **before** the dedupe check — 30 re-fans then add ~60,000 to a device that authored nothing, so **ordering authority accrues to whichever device has the worst network**, the exact opposite of causality. The correct rule (bump only on newly-stored) is not what §13 says. Meanwhile arm (a) converts a zero-write path into a **new** fsync workload that did not previously exist — a durability cost, not just latency, on the same cheap eMMC whose failures cause F09. **If no setting satisfies both, that is a finding the founder needs before ratification, not after.**

**F62 — `causal_seq` is unbounded, unverifiable, and forgeable.** Four arms. (i) **Ceiling brick:** ingest one well-formed peer event carrying `causal_seq = MAX_SAFE_INTEGER` (verified: zod 4 `.int()` accepts it and rejects 2⁵³). The device's mandatory `max+1` is then unrepresentable, `EventEnvelope.parse` rejects it, and **`append` throws with nothing persisted — the till stops mid-service.** The poison is in `peer_events`, 01-F1 forbids deleting it, restart does not clear it, and LAN fan-out spreads the brick branch-wide. This is the HLC poisoning hazard 25 §12 rejects, **inherited in a harsher form** — HLC drags the clock forward but keeps working. *Assert:* after ingesting a ceiling event, `append` still returns and persists; the schema must bound `causal_seq` well below `MAX_SAFE_INTEGER`, or receive must clamp rather than adopt. (ii) **Duplicate key tie:** two different events from one device at the same `causal_seq` delivered in opposite orders to two honest peers → `byCanonicalOrder` returns 0, `rebuild()` sorts by unordered SQL row emission, and the two peers settle on different answers permanently — **while the existing refold-equivalence property stays GREEN on each device individually.** Today `UNIQUE(device_id, lamport_seq)` makes this class unreachable; **`causal_seq` needs the equivalent constraint.** (iii) **Deflated key steals a first-wins price:** a side-loaded waiter build emits `line_added` for an existing `line_id` at `causal_seq 0`; it applies canonically first and its 100-paisa price is stored, `billed_effective` collapses, and **`global_seq` cannot override it — nothing heals.** Under the current key the same fraud **heals on ack**, because `global_seq` is key #1 and is assigned server-side. (iv) **Undetectable inflation:** a device pushes perfectly contiguous `lamport_seq` with `causal_seq` jumping by 1,000,000 per event. Because §13 makes `causal_seq` inherently gappy, contiguity is unavailable as a signal and the gateway has no per-origin bound — **the Auditor cannot distinguish a device that observed a lot from one that lied**, and the rogue has permanently seized the top of canonical order. *Assert:* either the gateway bounds/quarantines `causal_seq` beyond the org's observed max, or the Auditor flags anomalous per-event deltas, **or the decision records explicitly that `causal_seq` is accepted as unverifiable.**

**F63 — No meaning across non-communicating sets.** *Setup:* One org, an 8-month-old branch (`causal_seq ~50,000`) and one provisioned today (~300). Devices in the two never exchange events, so their clocks never bump against one another. Fold the org-wide merged log that 01-F7 read models, the owner app and the Auditor all consume. Make it bite: both branches concurrently emit `customer.merged` for the same E.164 identity (01-F23/F24 put the customer file at **org** scope). *Assert:* cross-branch ordering is defined and defensible; the merge race resolves identically at every reader **and swapping which branch is older does not change the winner**; provisioning a new branch reorders no existing branch's events. *Risk:* **All of the new branch sorts before all of the old one, permanently, for reasons unrelated to time or causality** — the six-month-old branch always loses. Not a convergence bug (everyone agrees) but an ordering with no defensible meaning, on exactly the plane analytics consume. §13 claim 2 is true but silently assumes one communicating set. **Invisible in every single-branch test.**

**F64 — Rank and value decouple; the kitchen shows a negative age.** *Setup:* Under the proposal, rank comes from `(causal_seq, device_id)` while `replay.ts:247,256` still stamp `confirmed_at`/`kot_at` from raw `device_created_at`. Give the kitchen host a dead RTC (or a hand-typed 2029) and construct the case where the canonically-first confirm carries a **later** wall clock than a causally-later `kot.printed`. *Assert:* inline fold invariants — `kot_at >= confirmed_at` whenever both exist, derived age non-negative, every duration bounded by the business day — under **both** comparators; and the same when values are stamped from the DEC-TIME-001 branch clock. *Risk:* Today rank and value are drawn from the **same number**, so they stay consistent with each other even when both are wrong — the wrongness is uniform and cancels in a difference. **The migration removes that coupling**, so `age_basis = kot_at ?? confirmed_at` can yield `kot_at < confirmed_at` and `now − age_basis` returns a negative age or an age of years; a negative-age ticket either pins to the top of the kitchen display forever or vanishes from it. **No such assertion exists anywhere today, so this arm fails silently.** This is the strongest argument that DEC-PERF-001 must not ship without DEC-TIME-001 — and note the reverse for F02/F03: the causal order silences the loud performance symptom while leaving the timing corruption fully intact and **harder to notice**. Also: 25 §14's "a uniform offset cancels in a difference" holds only within a single hub epoch — hub failover (01-F13) re-anchors branch time, and in the DEC-SYNC-009 deployment failover moves the time authority to the device least likely to have ever seen NTP. Branch time needs an epoch identifier so a re-anchor is detectable rather than a silent step.

### C. Migration risks (the rollout itself)

**F66 — Wire and schema compatibility.** Four arms. (i) **Flag day:** an N gateway requiring `causal_seq` against an N−1 LAN-only waiter tablet. If required in `messageSchemas.push`, `decodeMessage` throws, the socket closes, the tablet re-pushes forever — a permanent wedge DEC-SYNC-005 exists to prevent. If required at `registryValid()`, every event quarantines as `schema_invalid`, `quarantine()` **fills the lamport slot**, the ack advances, and `queue_depth` returns to 0 — **the honesty UI reports fully-synced while 100 % of the device's events are excluded from the merged log.** *Assert:* all events merge with zero quarantine rows and the socket never closes; and it is never true that `quarantine_count == N AND queue_depth == 0`. **`causal_seq` must be accepted as absent for at least one full release.** (ii) **Silent strip:** `EventEnvelope` is a `z.object`, which strips unknown keys, and **every relay hop re-parses** — mesh `rowToEnvelope`, `parseMessage`, and the gateway persisting `JSON.stringify` of the already-parsed message rather than the received bytes (despite the schema comment saying "verbatim-as-received"). One N−1 hop anywhere — and 01-F13 elects the counter, typically the least-updated device, as hub — silently deletes `causal_seq` and re-emits the stripped envelope as authoritative, into the ledger of record. *Assert:* byte-compare the envelope at every hop; and **given any single stored envelope a reader must be able to distinguish "authored before the change" from "lost in transit" without consulting any other event** — which today it cannot, since `schema_version` is keyed to the payload registry, not the envelope shape. The migration owes an envelope-level era marker. (iii) **Two shapes, one id:** the LAN copy (stripped) and the cloud copy (intact) of the same event. `authoredContent()` differs by the presence of the key, so `ingestTx` throws `DivergentDuplicateError` on a perfectly valid event — swallowed into `ingestBatch`'s `rejected` count with no notice — and at the gateway it becomes `id_content_divergence` with a spurious notice to an innocent origin. *Assert:* both shapes must not diverge, must converge on the bearing form, and must still adopt any carried `global_seq`. (iv) **The tempting shortcut:** bumping the existing `lamport_seq` on receive instead of adding a field. `handlePush`'s stop-at-gap walk breaks at the first jump and **`through` can never advance past it — nothing from that point on is ever stored, in this push or any future one, and no quarantine row is written**, so DEC-SYNC-005's never-wedge guarantee is defeated by a mechanism it does not cover. *Assert:* `MAX(lamport_seq) + 1 == COUNT(*)` over `events`; `causal_seq` is a distinct field. This is exactly the plausible wrong move a session under time pressure makes — it type-checks.

**F67 — The audit chain and the one-way rollback door.** *Setup:* Pre-migration `audit.*` events whose `prev_audit_hash` chains hashes computed over an envelope with no `causal_seq`. Test three parse variants: optional/absent, `.default(0)`, and a stored-JSON backfill. Then downgrade a device that has already written `causal_seq`-bearing audit events and append a fourth. *Assert:* `verifyAuditChain` returns `{ok: true}` after the upgrade **under the exact parse path the shipped store uses**, and byte-equality of `canonicalJson(envelope − server_received_at)` before and after for at least one stored audit event. **This forbids any default value and any in-place backfill.** *Risk:* Variants (ii) and (iii) inject `"causal_seq":0` into the covered set, so `verifyAuditChain` returns `ok:false` **for every device in the fleet simultaneously** — and per 01-F5 the Auditor's cross-check of device chains against the merged log is exactly what detects tail truncation, while 20 §4.2 makes any Auditor diff a release-train block. A fleet-wide false positive on that check destroys the signal. Worse if device and gateway backfill asymmetrically: the cross-plane check fails permanently though each plane is internally consistent. On rollback, N−1's parser strips the field, so N−1's hash cannot reproduce values already durably stored in successors' `prev_audit_hash` — and 01-F1 forbids a corrective edit. **The chain reads as broken to N−1 code forever; roll-forward is the only exit. State explicitly whether the migration is one-way; do not leave it implicit.**

**F68 — Mixed-comparator fleet, era-0 defaults, and a two-era Auditor.** *Setup:* (i) Build the identical event set under both comparators over a fleet with T1–T3 clocks, including an order with two `table_assigned` from different devices and one with duplicate `line_id` at different prices. (ii) Construct the minimal witness: `D_a` emits E1 then E2; `D_b`, having observed E1, emits E3; the cloud gives E2 a lower `global_seq` than E3. (iii) Ingest K events with **absent** `causal_seq` into an N=4,000 ledger under both candidate defaults. (iv) Run the Auditor over a ledger straddling the cutover. (v) Measure the migration's own cost: first open after upgrade on a 10,000-event ledger, M1 (let `refoldTx()` re-derive once) vs M2 (a backfill loop re-entering `applyFold` per event), on a throttled profile. *Assert:* (i) both comparators produce the same value for every order-sensitive projected field, **or the rollout is branch-atomic behind a flag that flips only when every device in the branch reports version N**. (ii) recorded as a **disagreement, not fixed** — E2 and E3 are genuinely concurrent, so the comparators are provably non-equivalent on any set containing concurrent cross-device events, and no migration can claim otherwise. (iii) O(1) rebuilds total, not O(K), with per-event latency flat in N — **neither the `0` nor the `+Infinity` constant satisfies this and order-correctness together**, so era-0 ordering must be defined explicitly rather than by defaulting a number. (iv) the diff must be empty, which requires the cloud read models to be rebuilt under the new comparator **in the same release, not lazily** — and a straddling run with stale read models must still produce a diff, proving the check is live. (v) first open < 60 s with **exactly one `rebuild()` call** and a fitted exponent < 1.2. *Risk:* Under (i), `D_new` shows table 4 and `D_old` shows table 7, both internally correct, **neither ever healing** — 01-N1 violated across the fleet for the whole rollout window, silently (01-F19's badge covers a different case), propagating into `confirmed_at` and therefore kitchen age. Under (iii), era-0 = 0 reintroduces the exact quadratic the change was adopted to delete, for the rollout's entire duration, **on the incremental append path where it is least expected**. Under (iv), the Auditor has no vocabulary for "this discrepancy is the intended consequence of a comparator change," so it either blocks the release train or gets muted — **and a muted Auditor is the highest-value correctness artifact turned off during the riskiest week.** Useful discriminator: 01-F30 conservation is comparator-insensitive, so a conservation failure during the migration window is a real bug, not noise. Under (v), M2 reproduces the B1 curve exactly: 10,000 full rebuilds, indistinguishable from a hang.

### D. Risks the proposal is likely to be *credited* with fixing, and does not

F24 (cursor gap), F25 (PITR wedge — the reorder harm goes, the throw likely stays), F26 (wiped device), F27 (ack crash loop), F09 (corrupt-row brick), F39 (one-way link), F41/F42/F43 (uplink topology and DR), F44 (branch/org scoping), F45 (revoked hub), F48 (clock-step liveness), F36/F37/F38 (mesh cost and liveness), F21 (atomic parking), F76 (payment idempotency — **worse**), F77 (approval), F33 (cloud-side ordering cost — **worse**), F07 (residency — **worse**).