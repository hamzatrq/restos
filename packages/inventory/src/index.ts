// @restos/inventory — the supply plane's arithmetic, pure and I/O-free.
//
// Owning spec: `specs/10-inventory-supply.md`. Design and build plan:
// `plans/inventory/design.md` (§7, slice 1 — the variance loop, deliberately WITHOUT a food-cost
// figure). `18 §2`: a domain type is declared once; nothing here redeclares a `packages/domain` one.
//
// ⚠ **NOTHING IN THIS PACKAGE PERFORMS I/O, AND THAT IS `DEC-ARCH-001` (B)'s ruled shape** — a pure
// package both planes may import. `10-F4` puts sale deduction in a CLOUD read model and the
// physical acts in the ledger; a device holds no correct expected-stock number at all
// (`10 §4` Flow A step 2, amended), which is why `10-F17`'s count is BLIND by construction rather
// than by choice.

export {
  type DishCost,
  dishCost,
  itemCostable,
  type WindowCompleteness,
  windowCompleteness,
} from "./completeness.js";
export { groupByKey, type Resolution, resolve } from "./contested.js";
export {
  areaKey,
  type CountedItem,
  type CountLine,
  type CountObservation,
  countObservations,
  type NotCountedReason,
  rollUpCount,
  worstBasis,
} from "./count.js";
// The debt markers for `count-entry.ts` and `completeness.ts` live at their DECLARATIONS, not here.
// `packages/domain/src/index.ts` records why: a marker above a barrel re-export is INERT —
// `check-seams` reports Rule A at the declaration site, and "a barrel re-export is not a use" cuts
// both ways. A marker that looks like a rail exception and is not is the worst kind of comment.
export { type CountEntry, countEntryToBase, PartialTierError } from "./count-entry.js";
export {
  type Consumption,
  consumption,
  type DeductionLine,
  type DeductionSet,
  deductionSet,
} from "./deduction.js";
export type { InventoryEvent } from "./event.js";
export {
  BANNED_VARIANCE_WORDS,
  BASIS_ERROR_BP,
  HINT_KINDS,
  type Hint,
  type HintKind,
  hintText,
  isAboveFloor,
  isSustainedRun,
  K_NOISE_FLOOR_BP,
  noiseFloor,
  SUSTAINED_RUN_PERIODS,
  type VocabularyViolation,
  vocabularyViolations,
} from "./noise.js";
export {
  COST_BASES,
  type CostBasis,
  costBasisOf,
  inWindow,
  type Period,
  type PhysicalFacts,
  periodsFor,
  physicalFacts,
  type ResolvedCost,
  valueOrNull,
} from "./period.js";
export {
  type DivideByZeroError,
  type Rational,
  roundHalfUp,
  valueAt,
} from "./rational.js";
export {
  type AreaMembership,
  BASE_UNITS,
  type BaseUnit,
  type CountUnits,
  type InventoryItem,
  ITEM_TYPES,
  type ItemType,
  type MenuRecipe,
  type PartialTier,
  type Recipe,
  type RecipeComponent,
  type RecipeLine,
  type ReferenceData,
  type ReferenceRefusal,
  referenceRefusals,
  type ValueQtyPair,
} from "./reference.js";
export {
  type SustainedHint,
  sustainedHints,
  type VarianceInput,
  type VarianceReport,
  type VarianceRow,
  varianceReports,
  type WithheldReason,
} from "./variance.js";
