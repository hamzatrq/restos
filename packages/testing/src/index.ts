// @restos/testing — deterministic sim harness (T-01-05 stage (d); 20 §2.4 / §6-Q1).
// Spec: specs/20-testing-correctness.md. Seam types come from @restos/sync-protocol.
export { createSim, type Sim, type SimLan, type TraceEntry } from "./sim.js";
// Sim-cloud double — T-01-06 contract (c): the PROTOCOL.md gateway stand-in for the
// deterministic sim leg (X1–X9), mirroring the LANDED gateway's laws (20 §2.7).
export {
  CATCHUP_PAGE_SIZE,
  type CloudTranscriptEntry,
  createSimCloud,
  type MergedEvent,
  type SimCloud,
  type SimCloudState,
  WAN_LATENCY_MS,
} from "./sim-cloud.js";
