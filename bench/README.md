# RestOS Tier-B kernel harness — Hermes parity + busy-day benchmarks

Additive test/bench infrastructure for the RestOS kernel's **pure-compute layer**: the
merge fold engine (`@restos/sync-client/fold-engine` → `createMergeEngine`) plus the
`@restos/domain` money / canonical-JSON / hash / state-machine code. It runs that layer
under **both Node (V8)** and the **standalone Hermes VM** — the JS engine the 2 GB target
tablets actually use — and asserts they compute **byte-identically**, then times the
busy-day workloads on each.

It touches **no product source**: everything here is new files under `bench/` plus three
root `package.json` scripts. The kernel modules are bundled from their real `.ts` sources,
so the code under test is byte-for-byte the shipped kernel.

## Run it

```bash
pnpm bench          # both phases (parity + benchmarks)
pnpm bench:parity   # phase 1 only — cross-engine byte-identity
pnpm bench:perf     # phase 2 only — the busy-day table
```

First run downloads a prebuilt Hermes CLI (~10 MB) to `bench/vendor/` (git-ignored).
Env knobs:

- `HERMES_BIN=/path/to/hermes` — use an existing Hermes instead of the vendored one.
- `SKIP_HERMES=1` — Node-only run (still builds + runs the battery under Node; prints the
  parity case list and the Node column, but performs no cross-engine comparison).

The captured console output of the last run is written to `bench/last-run.txt`.

## What it PROVES

- **Runtime parity.** For every fixture in the battery, `canonicalJson`/hash/projection
  output is **byte-identical** between V8 and Hermes — so the kernel does not silently
  compute a different answer on the tablet than in CI. Coverage: BigInt money helpers
  (`sumPaisa`/`applyRateBps`/`splitPaisa`, incl. the 2^53 boundary and overflow guards),
  `canonicalJson` (key ordering, number formatting, UTF-16 code-unit sort, non-ASCII /
  surrogate pairs, dropped values), `payloadHash` + the audit hash chain (SHA-256 over
  canonical JSON), `Array.sort` stability + the full merge projection over seeded
  busy-day sets, and the line state machine over every transition.
- **Work-independence.** The engine's `events_folded` counter equals the number of events
  applied for every N (`events_folded / N == 1.000`) — the O(1)/event correctness
  invariant, independent of engine, load, delivery order, or clock skew.
- **Relative performance.** Wall-clock medians for each busy-day workload under both
  engines, the measured **Hermes/V8 ratio**, and a **labeled tablet projection**.

## What it does NOT prove (Tier C — unmeasured here)

- **Real 2 GB-tablet absolute performance.** The tablet numbers are a **projection**
  (laptop Hermes × spec 25 §3's 5–10× hardware factor), never a measurement. A real
  device (thermals, 2 GB RAM pressure, ARM microarchitecture) is Tier C.
- **The storage layer.** `device-store` uses `better-sqlite3` (a native addon) on device
  the RN equivalent is `op-sqlite`, also native — neither runs under the Hermes CLI. This
  harness deliberately drives the pure fold engine with in-memory event arrays, exactly
  as the acceptance-test builders do. Storage throughput, WAL, pragmas: Tier C.
- **Plug-pull / crash-resume durability.** Physical wall-clock and p95/plug-pull rungs
  are a separate H-01 harness (Wave 0 remaining work), not this.
- **The zod validation layer.** See below — excluded on purpose, and can't run on the raw
  Hermes CLI anyway.

## Phase-0 findings (the Hermes-binary setup, and what diverges)

1. **Hermes obtained via a lightweight prebuilt path — no build from source.**
   `facebook/hermes` GitHub release `v0.13.0`, asset `hermes-cli-darwin.tar.gz`. The
   `hermes` VM inside is a **universal binary with a native arm64 slice** (no Rosetta on
   Apple silicon). It reports internal release `0.12.0`, HBC bytecode v96. (The
   `hermes-engine` npm package ships only the desktop *compiler* `hermesc`, not a runnable
   desktop VM — the VM there is Android `.aar` only — so it is not usable for this.)
2. **BigInt is supported** (`typeof 1n === "bigint"`, correct at the 2^53 boundary and on
   the `applyRateBps` `amount·bps` path). The money layer therefore runs unpolyfilled —
   itself a parity result worth stating, since BigInt was a real historical Hermes gap.
3. **ES6 `class` is gated behind a runtime flag.** The raw Hermes CLI rejects `class` in
   every form (declaration, expression, `extends`), plus private fields, static blocks,
   and async **arrow** functions — while natively running generators, spread, `Map`/`Set`,
   destructuring, optional chaining, and async function *declarations*. React Native
   enables these features at runtime; the CLI defaults them off. `@noble/hashes` (sha256,
   used by `payloadHash` and the audit chain) is class-based, so **the harness runs Hermes
   with `-Xes6-class`** (an undocumented companion to the listed `-Xes6-promise` /
   `-Xes6-proxy`). esbuild is intentionally *not* asked to down-level classes — it can't
   (a deliberate esbuild limitation), and it doesn't need to once the flag is set.
4. **The zod envelope/registry validation layer is excluded from the bundle.** The
   `@restos/domain` barrel eagerly builds zod schemas at module load, which drags in zod
   (async-arrow functions — unsupported by the raw CLI, and no `-Xes6-*` flag enables
   them) and `uuidv7` (unused; fixtures use fixed ids). The fold compute path never calls
   zod — it consumes already-parsed events, exactly as the acceptance builders construct
   them. So `bench/build.mjs` aliases `@restos/domain` to `bench/src/domain-kernel.ts`, a
   shim that re-exports the **identical** pure source modules (canonical / payload-hash /
   money / audit / states / product-constants) with the validation shell removed. This
   keeps the code under test byte-identical while dropping the bundle from ~610 KB to
   ~31 KB. **Finding:** the pure fold math is Hermes-clean, but the zod I/O-boundary layer
   requires RN's Babel/Metro transform pipeline (which lowers its classes + async), not
   the raw `hermes` binary.

## Architecture

- `build.mjs` — discovers the esbuild already in the pnpm store (vitest → vite → esbuild;
  no new dependency), bundles an entry `.ts` to one self-contained IIFE. A `.js`→`.ts`
  resolve plugin handles the kernel's NodeNext import extensions; the `@restos/domain`
  alias plugin swaps in the zod-free shim; a banner shims `print`/`console.log` into a
  single `__emit` so the same bundle prints on both runtimes. Target `es2020` keeps
  BigInt native and classes intact (Hermes runs them with the flag).
- `src/domain-kernel.ts` — the zod-free re-export of the pure `@restos/domain` layer.
- `src/harness.ts` — runtime-neutral helpers (seeded RNG, deterministic id/envelope
  builders, `Date.now` clock, the tagged emit protocol).
- `src/fixtures.ts` — deterministic seeded busy-day event logs (ordered + skewed-clock)
  and the adversarial canonical/hash payloads.
- `src/parity-entry.ts` / `src/bench-entry.ts` — the two bundled programs.
- `run.mjs` — the driver: acquires Hermes, builds both bundles, runs each under Node and
  Hermes, compares parity byte-for-byte, and prints the benchmark table + ratio +
  projection.

## Reproducibility

Inputs are seeded (mulberry32) and clock-free at generation time, so the same seed yields
byte-identical events on every run and every engine — the precondition for a meaningful
cross-runtime comparison. Benchmarks run 2 warmup + 7 timed passes per (workload, N) and
report the **median**; `Date.now()` (1 ms resolution, the only clock both engines share)
means the small-N rows are coarse — read the 10k rows as the reliable signal. Machine
load (`uptime`) is printed with the table.
