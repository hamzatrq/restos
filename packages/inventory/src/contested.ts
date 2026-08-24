/**
 * **THE ONE MERGE RULE IN THIS PACKAGE, AND IT IS THE ONE A PRIOR ATTEMPT AT THIS MODULE GOT
 * WRONG.**
 *
 * A business key (`line_id`, `count_id`, `purchase_id`, `wastage_id`) can arrive carrying two
 * different payloads. `01-F31` mints these keys at the UI precisely so a retry is ONE act, and
 * `01-F8` covers transport duplicates — so identical payloads under one key collapse, which is the
 * common and correct case. **Two DIFFERENT payloads under one key is a defect upstream**, and the
 * question is what a projection does with it.
 *
 * **Last-write-wins is the obvious answer and it is an `01-F34` break.** "Last" needs an order, and
 * a fold has none: not `global_seq` (a delivery cursor), not `lamport_seq`, not the device clock,
 * and not an envelope-id comparison — `26 §2` records that a `min(envelope.id)` tiebreak passes
 * plain convergence testing while smuggling wall clock in through the UUIDv7 prefix. So LWW makes
 * **delivery order decide the projected value**, and two devices folding one event set disagree.
 * The prior attempt at this module found exactly that in its own implementation, through a
 * relabel property test.
 *
 * **The rule here is a CONTESTED SET, and it is more than a convergence fix.** Distinct payloads
 * under one key are collected as a set; one distinct value resolves, more than one is
 * `contested`. That is commutative, associative, idempotent and reads no ordering metadata, so it
 * converges by construction — and it is the only answer consistent with this module's posture:
 * `10-F33` and `10-F29` both say that **a number we cannot stand behind is not shown**, and LWW's
 * answer is a number nobody can stand behind wearing the confidence of one that resolved.
 * `CONTESTED_LINE_BILLABLE` in `packages/domain` is the corpus's own precedent for the shape, one
 * plane over.
 *
 * ⚠ **A contested key does NOT degrade to zero, and this is the trap.** Dropping a contested
 * purchase would understate purchases and INFLATE the apparent gap; dropping a contested order line
 * would understate consumption and inflate it the same way — and an inflated gap on this module's
 * report is an accusation (`10-F19`). So every caller here propagates the contest to the affected
 * ITEMS and refuses their rows, rather than netting the missing value to nothing.
 */

import { canonicalJson } from "@restos/domain";

export type Resolution<T> =
  | { readonly kind: "resolved"; readonly value: T }
  | { readonly kind: "contested"; readonly values: readonly T[] }
  | { readonly kind: "absent" };

/**
 * Collapse the observations of one business key.
 *
 * `canonicalJson` is the comparison, not `JSON.stringify`: key order in a payload is not a fact
 * about the act, and two writers serialising the same intent differently would otherwise
 * manufacture a dispute out of nothing. `packages/domain` already declares that canonicalisation
 * once (`18 §2`), so this cannot drift from the hash the rest of the ledger uses.
 *
 * The returned `values` are ordered by their canonical form so the answer is a pure function of
 * the SET — a caller rendering "these two disagree" must not render them in arrival order, which
 * would leak delivery order into a rendered string even though the decision above it did not.
 */
export const resolve = <T>(observations: readonly T[]): Resolution<T> => {
  if (observations.length === 0) return { kind: "absent" };
  const distinct = new Map<string, T>();
  for (const observation of observations) distinct.set(canonicalJson(observation), observation);
  if (distinct.size === 1) {
    // biome-ignore lint/style/noNonNullAssertion: size === 1 proves the iterator yields one value.
    return { kind: "resolved", value: distinct.values().next().value! };
  }
  return {
    kind: "contested",
    values: [...distinct.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v),
  };
};

/** Group observations by their business key, preserving nothing about arrival order. */
export const groupByKey = <T>(
  rows: readonly T[],
  key: (row: T) => string,
): ReadonlyMap<string, readonly T[]> => {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = out.get(k);
    if (bucket === undefined) out.set(k, [row]);
    else bucket.push(row);
  }
  return out;
};
