// Open product constants (T-01-15; specs/26 §9) — each is ONE constant, none blocks
// the merge engine. Implemented behind named domain constants with the matrix
// defaults so the engine has a single place to read and the founder has a single
// place to overrule. Every entry below is // DECISION PENDING: the value is the
// matrix default, not a ratified product call.

/**
 * Does a contested line (≥2 distinct terminal heads, e.g. served vs voided) count
 * toward `billed_effective`? Both answers converge identically — this is money
 * policy (matrix §5.4). Default TRUE per the 02-F20 argument: post-KOT removal
 * requires an approved void.recorded, so the unapproved side must not silently
 * erase revenue.
 */
// DECISION PENDING (matrix §5.4)
export const CONTESTED_LINE_BILLABLE = true;

/**
 * Availability among concurrent heads: does `false` (86'd) win? A pure product
 * call since the subset-safety argument was withdrawn (matrix row "availability",
 * §5.8). Default TRUE (false-wins): a conservative preference among the heads the
 * device holds. Unconsumed until the availability fold lands.
 */
// DECISION PENDING (matrix §5.8)
export const AVAILABILITY_FALSE_WINS = true;

/**
 * What a KOT header prints for an order with two head tables (matrix §5.10). The
 * paper structurally requires one string; printing "the default head" is NOT
 * defensible (there is no clock-free default). Default: the explicit conflict
 * marker. Unconsumed until doc-03 printing lands.
 */
// DECISION PENDING (matrix §5.10)
export const KOT_TWO_HEAD_TABLE_HEADER = "TABLE CONFLICT";

/**
 * "Keep the change" (matrix §5.3): is an excess-tender state an exception? With
 * tips unmodeled (DEC-MONEY-004) and no cash-rounding rule in the corpus, the
 * default is NOT-an-exception (01-F17 never-block spirit; firing the shift-close
 * variance alarm on the base case of a Friday night is the named failure mode).
 * Unconsumed until the shift_cash fold lands.
 */
// DECISION PENDING (matrix §5.3 / DEC-MONEY-004)
export const EXCESS_TENDER_IS_EXCEPTION = false;
