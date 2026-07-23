// Pure fold-engine entry (T-01-11 ruling 2, plans/wave-0/t-01-11-rulings.md):
// the cloud Auditor's independent refold MUST use the REAL merge engine
// (01-F34 rewritten / 26 §8 — reimplementing fold logic in the gateway would
// reincarnate exactly the comparator drift the diff leg exists to catch), but
// the package's root entry pulls in the device store and with it the
// better-sqlite3 native addon, which must never load in the gateway runtime.
// This subpath (`@restos/sync-client/fold-engine`) exposes ONLY the pure
// engine: folds/merge.ts imports nothing beyond @restos/domain. Additive —
// the root entry re-exports the same symbols for device-side consumers.
export {
  type ApplyResult,
  type BilledLineCell,
  billedEffectiveFromJsonLines,
  createMergeEngine,
  type DropPlan,
  type FoldState,
  type FoldStats,
  type KitchenQueueRow,
  type MergeEngine,
  type OpenOrderRow,
  type ParkedRow,
  type ProjectedOrder,
} from "./folds/merge.js";
