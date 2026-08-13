// Pure fold-engine entry (T-01-11 ruling 2, plans/wave-0/t-01-11-rulings.md):
// the cloud Auditor's independent refold MUST use the REAL merge engine
// (01-F34 rewritten / 26 §8 — reimplementing fold logic in the gateway would
// reincarnate exactly the comparator drift the diff leg exists to catch), but
// the package's root entry pulls in the device store and with it the
// better-sqlite3 native addon, which must never load in the gateway runtime.
// This subpath (`@restos/sync-client/fold-engine`) exposes ONLY the pure
// engine: folds/merge.ts imports nothing beyond @restos/domain. Additive —
// the root entry re-exports the same symbols for device-side consumers.
//
// (Export blocks are ordered by module path — biome's organizeImports — so the
// customer file leads and the merge engine this file is named for sits second.)

// The `customer_file` fold (02-F27/02-F28; 01-F23) on the SAME pure subpath and for the same
// reason as the two below it: fold logic is never reimplemented outside this package (26 §8 /
// 01-F34), and the Auditor's independent refold (01-F7, 20 §4.2) must reach every fold or the
// diff leg silently stops covering one.
export {
  type CustomerAddress,
  type CustomerFileProjection,
  type CustomerFileState,
  type CustomerRow,
  emptyCustomerFile,
  foldCustomerFile,
  projectCustomerFile,
} from "./folds/customer-file.js";
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
// The `shift_cash` fold (S-2, FOLDS.md line 15) exposed on the SAME pure subpath and for the
// same reason: a money fold the cloud Auditor cannot refold without the better-sqlite3 addon
// is unauditable (26 §8 / 01-F34 — fold logic is never reimplemented outside this package).
export {
  type DayRow,
  emptyShiftCash,
  foldShiftCash,
  projectShiftCash,
  type ShiftCashProjection,
  type ShiftCashState,
  type ShiftRow,
  type UnboundDrawerRow,
  type UnboundRow,
} from "./folds/shift-cash.js";
