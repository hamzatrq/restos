// harness.ts — runtime-neutral helpers shared by the parity and benchmark entries.
// Self-contained (no zod, no uuidv7, no node builtins) so the esbuild bundle runs
// unchanged under both Node and the standalone Hermes VM.
import type { EventEnvelopeT, ParsedEvent } from "./domain-kernel.ts";

// __emit is provided by the bundle banner (bench/build.mjs): `print` on Hermes,
// `console.log` on Node. Declared here so the entries can call it type-safely.
declare const __emit: (s: string) => void;

/** Emit one already-serialized line to stdout. */
export const line = (s: string): void => __emit(s);

/** Parity result record: a case name and the canonical-JSON bytes of its output.
 * Tab-delimited — canonicalJson never contains a raw tab or newline (JSON strings
 * escape them), so the driver can split safely. */
export const emitResult = (name: string, bytes: string): void => __emit(`@P\t${name}\t${bytes}`);

/** Benchmark sample: workload × N × run index → wall-clock ms + the work counter. */
export const emitBench = (
  workload: string,
  n: number,
  run: number,
  ms: number,
  eventsFolded: number,
): void => __emit(`@B\t${workload}\t${n}\t${run}\t${ms}\t${eventsFolded}`);

/** Engine-identity + meta line (the driver already knows which engine it launched,
 * but this makes captured logs self-describing). */
export const emitMeta = (key: string, value: string): void => __emit(`@M\t${key}\t${value}`);

/** Wall clock in milliseconds. Hermes has no performance.now(), so Date.now() is the
 * only primitive both runtimes share — benchmarks size their iteration counts so each
 * timed block dominates the 1 ms resolution. */
export const now = (): number => Date.now();

/** Deterministic PRNG (mulberry32) — the same generator the acceptance builders use,
 * copied here so fixtures are seeded and reproducible with zero ambient randomness. */
export const seededRng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A monotonic, deterministic envelope id source — replaces uuidv7 (never bundled).
 * Zero-padded so lexical order matches emission order for readable fixtures. */
export const idFactory = (prefix = "e"): (() => string) => {
  let n = 0;
  return () => `${prefix}-${String(n++).padStart(7, "0")}`;
};

/** Build a well-formed ParsedEvent WITHOUT the zod parse layer — mirrors how the
 * acceptance builders assemble envelopes directly. The fold engine reads only
 * `envelope.id` and `envelope.device_created_at`; the remaining fields are filled so
 * the envelope is structurally complete (and canonicalJson-hashable for the audit case). */
export const mkEvent = (
  type: string,
  payload: Record<string, unknown>,
  opts: { id: string; at?: number; lamport?: number; device?: string },
): ParsedEvent => {
  const envelope: EventEnvelopeT = {
    id: opts.id,
    org_id: "org-bench",
    branch_id: "br-bench",
    device_id: opts.device ?? "d0",
    actor_user_id: null,
    lamport_seq: opts.lamport ?? 0,
    device_created_at: opts.at ?? 1_752_800_000_000,
    server_received_at: null,
    type,
    schema_version: 1,
    payload,
    refs: [],
  };
  return { type: type as ParsedEvent["type"], payload, envelope };
};

/** Median of a numeric sample (sorted-copy, mean of the two middle values on ties). */
export const median = (xs: readonly number[]): number => {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1
    ? (s[mid] as number)
    : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
};
