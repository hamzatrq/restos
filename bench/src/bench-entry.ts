// bench-entry.ts — PHASE 2 (performance). Bundled and run under BOTH Node and Hermes;
// run.mjs aggregates the `@B` samples into the busy-day table + the Hermes/V8 ratio.
// All workloads drive the PURE merge engine (createMergeEngine). Timing uses Date.now
// (the only clock both runtimes share), so N is sized to dominate its 1 ms resolution.
import { createMergeEngine } from "../../packages/sync-client/src/fold-engine.ts";
import { busyDay } from "./fixtures.ts";
import { emitBench, emitMeta, now } from "./harness.ts";

emitMeta(
  "engine",
  typeof (globalThis as { print?: unknown }).print === "function" ? "hermes" : "node",
);

const RUNS = 7; // per (workload, N); run.mjs reports the median
const WARMUP = 2; // untimed passes first, to settle allocation/JIT before measuring

/** Cold fold of the whole delivered set from scratch (rebuild) — the offline-day
 * worst case. Fresh engine each pass; the event array is generated once and reused. */
function benchFoldCold(label: string, sizes: readonly number[]): void {
  for (const n of sizes) {
    const { events } = busyDay(1000 + n, n);
    const applied = events.length;
    for (let w = 0; w < WARMUP; w++) createMergeEngine().rebuild(events);
    for (let r = 0; r < RUNS; r++) {
      const engine = createMergeEngine();
      const t0 = now();
      engine.rebuild(events);
      const ms = now() - t0;
      emitBench(label, applied, r, ms, engine.stats().events_folded);
    }
  }
}

/** The reconnect / batched catch-up path: stream events in one at a time via apply().
 * The O(1)/event invariant is the WORK COUNTER, not the clock: every event folds
 * exactly once, so events_folded MUST equal the number applied for every N (no
 * super-linear re-folding). run.mjs asserts events_folded / N == 1 across all N. */
function benchReconnect(sizes: readonly number[]): void {
  for (const n of sizes) {
    const { events } = busyDay(5000 + n, n);
    const applied = events.length;
    for (let w = 0; w < WARMUP; w++) {
      const e = createMergeEngine();
      for (const ev of events) e.apply(ev);
    }
    for (let r = 0; r < RUNS; r++) {
      const engine = createMergeEngine();
      const t0 = now();
      for (const ev of events) engine.apply(ev);
      const ms = now() - t0;
      emitBench("reconnect-stream", applied, r, ms, engine.stats().events_folded);
    }
  }
}

/** Skewed-clock append: identical workload but every device_created_at is scattered
 * ±1 day out of order. The fold reads no ordering metadata, so cost must match the
 * ordered mixed day — this profiles that invariance. */
function benchSkewed(n: number): void {
  const { events } = busyDay(77, n, true);
  const applied = events.length;
  for (let w = 0; w < WARMUP; w++) createMergeEngine().rebuild(events);
  for (let r = 0; r < RUNS; r++) {
    const engine = createMergeEngine();
    const t0 = now();
    engine.rebuild(events);
    const ms = now() - t0;
    emitBench("skewed-clock", applied, r, ms, engine.stats().events_folded);
  }
}

const COLD_SIZES = [2500, 5000, 10000] as const;
const RECONNECT_SIZES = [2500, 5000, 10000] as const;

benchFoldCold("fold-cold", COLD_SIZES);
benchReconnect(RECONNECT_SIZES);
benchSkewed(10000);
// The ordered mixed-day baseline at the same size the skewed run uses, so run.mjs can
// place them side by side (same seed family, same event count).
benchFoldCold("mixed-day", [10000]);

emitMeta("done", "bench");
