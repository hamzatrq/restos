// Ratified product constants (T-01-15; specs/26 §9). Each is ONE constant, none
// blocks the merge engine. Kept as named constants — rather than inlined at the
// use site — so the engine has a single place to read and the founder a single
// place to overrule. All four were RATIFIED by the founder in July 2026 at their
// matrix defaults; the rationale below is now law, not analysis.

/**
 * Does a contested line (≥2 distinct terminal heads, e.g. served vs voided) count
 * toward `billed_effective`? Both answers converge identically — this is money
 * policy (matrix §5.4). RATIFIED TRUE per the 02-F20 argument: post-KOT removal
 * requires an approved void.recorded, so the unapproved side must not silently
 * erase revenue.
 */
export const CONTESTED_LINE_BILLABLE = true;

/**
 * Availability among concurrent heads: does `false` (86'd) win? A pure product
 * call since the subset-safety argument was withdrawn (matrix row "availability",
 * §5.8). RATIFIED TRUE (false-wins): the conservative preference among the heads
 * the device holds — do not sell what someone marked out. CONSUMED by the merge engine's
 * item-keyed availability projection (the 26 §3 sidecar) — it supplies the direction
 * both for a contested head set and for an unresolvable one.
 */
export const AVAILABILITY_FALSE_WINS = true;

/**
 * What a KOT header prints for an order with two head tables (matrix §5.10). The
 * paper structurally requires one string; printing "the default head" is NOT
 * defensible (there is no clock-free default). RATIFIED: the explicit conflict
 * marker. Unconsumed until doc-03 printing lands.
 *
 * @unreached-owed The KOT layout (K-5) landed without the two-head-table case — `main/printing.ts`
 * fans out per station and never renders this header. The file's own comment already said
 * "unconsumed"; this makes the gate agree with the comment instead of only the comment knowing.
 */
export const KOT_TWO_HEAD_TABLE_HEADER = "TABLE CONFLICT";

/**
 * "Keep the change" (matrix §5.3): is an excess-tender state an exception? With
 * tips unmodeled (DEC-MONEY-004) and no cash-rounding rule in the corpus,
 * RATIFIED as NOT-an-exception (01-F17 never-block spirit; firing the shift-close
 * variance alarm on the base case of a Friday night is the named failure mode).
 * Unconsumed until the shift_cash fold lands.
 *
 * @unreached-owed Owed to `S-2`, the `shift_cash` fold (`plans/wave-1/service-surface.md`) — the
 * one place a variance alarm can consult it. Note the standing hazard beside it: `DEC-MONEY-004`
 * is ratified at FULL tips and will change that fold's arithmetic.
 */
export const EXCESS_TENDER_IS_EXCEPTION = false;
