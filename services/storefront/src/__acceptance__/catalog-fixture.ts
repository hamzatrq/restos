import type { PricedCart, StorefrontCatalog } from "../catalog.js";

/**
 * ⚠ **TEST SUPPORT ONLY — a published catalog, pinned.** Named the way `inMemoryOutbox` is named,
 * for the reason `outbox.ts` gives: the one thing this class of defect needs is that a stub cannot
 * be mistaken for the real thing at a shipping call site. The shipping catalog is
 * `createGatewayCatalog`, which reads the real published artifact (`06-F33`).
 *
 * It records what it was ASKED for, because `06-F33`'s batching is a property with teeth — one
 * order must price against one version — and a per-line implementation is otherwise invisible.
 */
export type FixedCatalog = StorefrontCatalog & {
  readonly asked: () => readonly (readonly string[])[];
};

export const fixedCatalog = (
  prices: Readonly<Record<string, number>>,
  version = 7,
): FixedCatalog => {
  const asked: string[][] = [];
  return {
    priceLines: async (item_ids): Promise<PricedCart> => {
      asked.push([...item_ids]);
      const paisa = new Map<string, number>();
      for (const id of item_ids) {
        const cell = prices[id];
        // `01-F60`: an absent cell is ABSENT. `?? 0` here would be the shipped defect wearing a
        // fixture, and would make every "unpriced is refused" assertion vacuous.
        if (cell !== undefined) paisa.set(id, cell);
      }
      return { version, paisa };
    },
    asked: () => asked,
  };
};
